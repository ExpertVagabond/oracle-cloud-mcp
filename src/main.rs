use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::io::{self, BufRead, Write};

struct OciClient {
    auth_token: String,
    region: String,
    tenancy_ocid: String,
    http: reqwest::Client,
}

impl OciClient {
    fn new() -> Self {
        Self {
            auth_token: env::var("OCI_AUTH_TOKEN").unwrap_or_default(),
            region: env::var("OCI_REGION").unwrap_or_else(|_| "us-chicago-1".into()),
            tenancy_ocid: env::var("OCI_TENANCY_OCID").unwrap_or_default(),
            http: reqwest::Client::new(),
        }
    }

    fn base_url(&self, service: &str) -> String {
        format!("https://{}.{}.oraclecloud.com/20160918", service, self.region)
    }

    fn compartment(&self, args: &Value) -> String {
        args.get("compartment_id")
            .and_then(|v| v.as_str())
            .unwrap_or(&self.tenancy_ocid)
            .to_string()
    }

    async fn get(&self, url: &str) -> Result<Value, String> {
        let resp = self.http.get(url)
            .bearer_auth(&self.auth_token)
            .send().await
            .map_err(|e| format!("HTTP error: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("OCI API error ({status}): {text}"));
        }
        resp.json::<Value>().await.map_err(|e| format!("JSON error: {e}"))
    }

    async fn post(&self, url: &str, body: Value) -> Result<Value, String> {
        let resp = self.http.post(url)
            .bearer_auth(&self.auth_token)
            .json(&body)
            .send().await
            .map_err(|e| format!("HTTP error: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("OCI API error ({status}): {text}"));
        }
        resp.json::<Value>().await.map_err(|e| format!("JSON error: {e}"))
    }

    async fn delete(&self, url: &str) -> Result<Value, String> {
        let resp = self.http.delete(url)
            .bearer_auth(&self.auth_token)
            .send().await
            .map_err(|e| format!("HTTP error: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("OCI API error ({status}): {text}"));
        }
        Ok(json!({"deleted": true}))
    }

    async fn call_tool(&self, name: &str, args: &Value) -> Result<Value, String> {
        let cid = self.compartment(args);
        let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50);

        match name {
            // Compute
            "oci_compute_list_instances" => {
                self.get(&format!("{}/instances?compartmentId={}&limit={}", self.base_url("iaas"), cid, limit)).await
            }
            "oci_compute_get_instance" => {
                let id = args.get("instance_id").and_then(|v| v.as_str()).unwrap_or("");
                self.get(&format!("{}/instances/{}", self.base_url("iaas"), id)).await
            }
            "oci_compute_list_shapes" => {
                self.get(&format!("{}/shapes?compartmentId={}&limit={}", self.base_url("iaas"), cid, limit)).await
            }
            "oci_compute_instance_action" => {
                let id = args.get("instance_id").and_then(|v| v.as_str()).unwrap_or("");
                let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("STOP");
                self.post(&format!("{}/instances/{}?action={}", self.base_url("iaas"), id, action), json!({})).await
            }
            // Object Storage
            "oci_os_get_namespace" => {
                self.get(&format!("https://objectstorage.{}.oraclecloud.com/n/", self.region)).await
            }
            "oci_os_list_buckets" => {
                let ns = args.get("namespace").and_then(|v| v.as_str()).unwrap_or("");
                self.get(&format!("https://objectstorage.{}.oraclecloud.com/n/{}/b?compartmentId={}&limit={}", self.region, ns, cid, limit)).await
            }
            "oci_os_create_bucket" => {
                let ns = args.get("namespace").and_then(|v| v.as_str()).unwrap_or("");
                let name = args.get("bucket_name").and_then(|v| v.as_str()).unwrap_or("");
                self.post(&format!("https://objectstorage.{}.oraclecloud.com/n/{}/b", self.region, ns), json!({
                    "name": name, "compartmentId": cid,
                    "publicAccessType": args.get("public_access").and_then(|v| v.as_str()).unwrap_or("NoPublicAccess")
                })).await
            }
            "oci_os_list_objects" => {
                let ns = args.get("namespace").and_then(|v| v.as_str()).unwrap_or("");
                let bucket = args.get("bucket_name").and_then(|v| v.as_str()).unwrap_or("");
                self.get(&format!("https://objectstorage.{}.oraclecloud.com/n/{}/b/{}/o?limit={}", self.region, ns, bucket, limit)).await
            }
            "oci_os_delete_bucket" => {
                let ns = args.get("namespace").and_then(|v| v.as_str()).unwrap_or("");
                let bucket = args.get("bucket_name").and_then(|v| v.as_str()).unwrap_or("");
                self.delete(&format!("https://objectstorage.{}.oraclecloud.com/n/{}/b/{}", self.region, ns, bucket)).await
            }
            // Block Storage
            "oci_bv_list_volumes" => {
                self.get(&format!("{}/volumes?compartmentId={}&limit={}", self.base_url("iaas"), cid, limit)).await
            }
            "oci_bv_list_boot_volumes" => {
                let ad = args.get("availability_domain").and_then(|v| v.as_str()).unwrap_or("");
                self.get(&format!("{}/bootVolumes?compartmentId={}&availabilityDomain={}&limit={}", self.base_url("iaas"), cid, ad, limit)).await
            }
            // Networking
            "oci_vcn_list" => {
                self.get(&format!("{}/vcns?compartmentId={}&limit={}", self.base_url("iaas"), cid, limit)).await
            }
            "oci_subnet_list" => {
                let vcn = args.get("vcn_id").and_then(|v| v.as_str()).unwrap_or("");
                self.get(&format!("{}/subnets?compartmentId={}&vcnId={}&limit={}", self.base_url("iaas"), cid, vcn, limit)).await
            }
            "oci_vcn_create" => {
                let display = args.get("display_name").and_then(|v| v.as_str()).unwrap_or("");
                let cidrs = args.get("cidr_blocks").cloned().unwrap_or(json!(["10.0.0.0/16"]));
                self.post(&format!("{}/vcns", self.base_url("iaas")), json!({
                    "compartmentId": cid, "displayName": display, "cidrBlocks": cidrs
                })).await
            }
            // Autonomous Database
            "oci_adb_list" => {
                self.get(&format!("https://database.{}.oraclecloud.com/20160918/autonomousDatabases?compartmentId={}&limit={}", self.region, cid, limit)).await
            }
            "oci_adb_get" => {
                let id = args.get("database_id").and_then(|v| v.as_str()).unwrap_or("");
                self.get(&format!("https://database.{}.oraclecloud.com/20160918/autonomousDatabases/{}", self.region, id)).await
            }
            "oci_adb_start" => {
                let id = args.get("database_id").and_then(|v| v.as_str()).unwrap_or("");
                self.post(&format!("https://database.{}.oraclecloud.com/20160918/autonomousDatabases/{}/actions/start", self.region, id), json!({})).await
            }
            "oci_adb_stop" => {
                let id = args.get("database_id").and_then(|v| v.as_str()).unwrap_or("");
                self.post(&format!("https://database.{}.oraclecloud.com/20160918/autonomousDatabases/{}/actions/stop", self.region, id), json!({})).await
            }
            // IAM
            "oci_iam_list_users" => {
                self.get(&format!("https://identity.{}.oraclecloud.com/20160918/users?compartmentId={}&limit={}", self.region, cid, limit)).await
            }
            "oci_iam_list_groups" => {
                self.get(&format!("https://identity.{}.oraclecloud.com/20160918/groups?compartmentId={}&limit={}", self.region, cid, limit)).await
            }
            "oci_iam_list_policies" => {
                self.get(&format!("https://identity.{}.oraclecloud.com/20160918/policies?compartmentId={}&limit={}", self.region, cid, limit)).await
            }
            "oci_iam_list_compartments" => {
                self.get(&format!("https://identity.{}.oraclecloud.com/20160918/compartments?compartmentId={}&limit={}&accessLevel=ANY&compartmentIdInSubtree=true", self.region, cid, limit)).await
            }
            "oci_iam_list_availability_domains" => {
                self.get(&format!("https://identity.{}.oraclecloud.com/20160918/availabilityDomains?compartmentId={}", self.region, cid)).await
            }
            _ => Err(format!("Unknown tool: {name}")),
        }
    }
}

#[derive(Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

fn tool_definitions() -> Value {
    json!([
        {"name":"oci_compute_list_instances","description":"List compute instances in a compartment","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":50}}}},
        {"name":"oci_compute_get_instance","description":"Get details of a compute instance","inputSchema":{"type":"object","properties":{"instance_id":{"type":"string"}},"required":["instance_id"]}},
        {"name":"oci_compute_list_shapes","description":"List available compute shapes","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":100}}}},
        {"name":"oci_compute_instance_action","description":"Perform action on instance (START/STOP/RESET/SOFTSTOP/SOFTRESET)","inputSchema":{"type":"object","properties":{"instance_id":{"type":"string"},"action":{"type":"string","enum":["START","STOP","RESET","SOFTSTOP","SOFTRESET"]}},"required":["instance_id","action"]}},
        {"name":"oci_os_get_namespace","description":"Get Object Storage namespace","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"}}}},
        {"name":"oci_os_list_buckets","description":"List Object Storage buckets","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"namespace":{"type":"string"},"limit":{"type":"number","default":100}}}},
        {"name":"oci_os_create_bucket","description":"Create an Object Storage bucket","inputSchema":{"type":"object","properties":{"bucket_name":{"type":"string"},"namespace":{"type":"string"},"compartment_id":{"type":"string"},"public_access":{"type":"string","default":"NoPublicAccess"}},"required":["bucket_name","namespace"]}},
        {"name":"oci_os_list_objects","description":"List objects in a bucket","inputSchema":{"type":"object","properties":{"bucket_name":{"type":"string"},"namespace":{"type":"string"},"prefix":{"type":"string"},"limit":{"type":"number","default":100}},"required":["bucket_name","namespace"]}},
        {"name":"oci_os_delete_bucket","description":"Delete an empty bucket","inputSchema":{"type":"object","properties":{"bucket_name":{"type":"string"},"namespace":{"type":"string"}},"required":["bucket_name","namespace"]}},
        {"name":"oci_bv_list_volumes","description":"List block volumes","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":50}}}},
        {"name":"oci_bv_list_boot_volumes","description":"List boot volumes","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"availability_domain":{"type":"string"},"limit":{"type":"number","default":50}}}},
        {"name":"oci_vcn_list","description":"List Virtual Cloud Networks","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":50}}}},
        {"name":"oci_subnet_list","description":"List subnets in a VCN","inputSchema":{"type":"object","properties":{"vcn_id":{"type":"string"},"compartment_id":{"type":"string"},"limit":{"type":"number","default":50}},"required":["vcn_id"]}},
        {"name":"oci_vcn_create","description":"Create a VCN","inputSchema":{"type":"object","properties":{"display_name":{"type":"string"},"cidr_blocks":{"type":"array","items":{"type":"string"}},"compartment_id":{"type":"string"}},"required":["display_name"]}},
        {"name":"oci_adb_list","description":"List Autonomous Databases","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":50}}}},
        {"name":"oci_adb_get","description":"Get Autonomous Database details","inputSchema":{"type":"object","properties":{"database_id":{"type":"string"}},"required":["database_id"]}},
        {"name":"oci_adb_start","description":"Start an Autonomous Database","inputSchema":{"type":"object","properties":{"database_id":{"type":"string"}},"required":["database_id"]}},
        {"name":"oci_adb_stop","description":"Stop an Autonomous Database","inputSchema":{"type":"object","properties":{"database_id":{"type":"string"}},"required":["database_id"]}},
        {"name":"oci_iam_list_users","description":"List IAM users","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":100}}}},
        {"name":"oci_iam_list_groups","description":"List IAM groups","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":100}}}},
        {"name":"oci_iam_list_policies","description":"List IAM policies","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":100}}}},
        {"name":"oci_iam_list_compartments","description":"List compartments","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"},"limit":{"type":"number","default":100}}}},
        {"name":"oci_iam_list_availability_domains","description":"List availability domains","inputSchema":{"type":"object","properties":{"compartment_id":{"type":"string"}}}}
    ])
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    let client = OciClient::new();
    tracing::info!("oracle-cloud-mcp starting");

    let stdin = io::stdin();
    let stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line { Ok(l) => l, Err(_) => break };
        if line.trim().is_empty() { continue; }

        let req: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => { tracing::warn!("invalid JSON-RPC: {e}"); continue; }
        };

        let id = req.id.clone().unwrap_or(Value::Null);

        let response = match req.method.as_str() {
            "initialize" => Some(JsonRpcResponse {
                jsonrpc: "2.0".into(), id,
                result: Some(json!({"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"oracle-cloud-mcp","version":env!("CARGO_PKG_VERSION")}})),
                error: None,
            }),
            "notifications/initialized" => None,
            "tools/list" => Some(JsonRpcResponse {
                jsonrpc: "2.0".into(), id,
                result: Some(json!({"tools": tool_definitions()})),
                error: None,
            }),
            "tools/call" => {
                let name = req.params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let args = req.params.get("arguments").cloned().unwrap_or(json!({}));
                let result = match client.call_tool(name, &args).await {
                    Ok(val) => json!({"content":[{"type":"text","text":serde_json::to_string_pretty(&val).unwrap_or_default()}]}),
                    Err(e) => json!({"content":[{"type":"text","text":format!("Error: {e}")}],"isError":true}),
                };
                Some(JsonRpcResponse { jsonrpc: "2.0".into(), id, result: Some(result), error: None })
            }
            other => Some(JsonRpcResponse {
                jsonrpc: "2.0".into(), id, result: None,
                error: Some(json!({"code":-32601,"message":format!("method not found: {other}")})),
            }),
        };

        if let Some(resp) = response {
            let mut out = stdout.lock();
            let _ = serde_json::to_writer(&mut out, &resp);
            let _ = out.write_all(b"\n");
            let _ = out.flush();
        }
    }
}
