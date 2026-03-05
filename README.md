# oracle-cloud-mcp

[\![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[\![MCP](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)
[\![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)

MCP server for Oracle Cloud Infrastructure (OCI). Provides access to Compute, Object Storage, Block Storage, Networking, Autonomous Database, and IAM via the official OCI SDK.

## Tools (23 total)

### Compute (4 tools)

| Tool | Description |
|------|-------------|
| `oci_compute_list_instances` | List all VM instances in a compartment |
| `oci_compute_get_instance` | Get detailed info for a specific instance |
| `oci_compute_list_shapes` | List available shapes (including Always Free) |
| `oci_compute_instance_action` | START, STOP, RESET, SOFTSTOP, or SOFTRESET an instance |

### Object Storage (5 tools)

| Tool | Description |
|------|-------------|
| `oci_os_get_namespace` | Get the Object Storage namespace |
| `oci_os_list_buckets` | List all buckets in a compartment |
| `oci_os_create_bucket` | Create a new bucket (Standard or Archive) |
| `oci_os_list_objects` | List objects with optional prefix filter |
| `oci_os_delete_bucket` | Delete an empty bucket |

### Block Storage (2 tools)

| Tool | Description |
|------|-------------|
| `oci_bv_list_volumes` | List block volumes |
| `oci_bv_list_boot_volumes` | List boot volumes in an availability domain |

### Networking (3 tools)

| Tool | Description |
|------|-------------|
| `oci_vcn_list` | List Virtual Cloud Networks |
| `oci_subnet_list` | List subnets in a VCN |
| `oci_vcn_create` | Create a new VCN with CIDR blocks |

### Autonomous Database (4 tools)

| Tool | Description |
|------|-------------|
| `oci_adb_list` | List Autonomous Databases (ATP/ADW) |
| `oci_adb_get` | Get database details and connection strings |
| `oci_adb_start` | Start a stopped database |
| `oci_adb_stop` | Stop a running database |

### IAM (5 tools)

| Tool | Description |
|------|-------------|
| `oci_iam_list_users` | List IAM users |
| `oci_iam_list_groups` | List IAM groups |
| `oci_iam_list_policies` | List IAM policies and statements |
| `oci_iam_list_compartments` | List compartments in the tenancy |
| `oci_iam_list_availability_domains` | List availability domains |

## Install

```bash
npm install
```

## Configuration

Configure OCI credentials in `~/.oci/config`:

```ini
[DEFAULT]
user=ocid1.user.oc1..xxx
fingerprint=xx:xx:xx:xx:xx
tenancy=ocid1.tenancy.oc1..xxx
region=us-chicago-1
key_file=~/.oci/api_keys/oci_api_key.pem
```

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "oracle": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/oracle-mcp/index.js"],
      "env": {
        "OCI_CONFIG_FILE": "~/.oci/config",
        "OCI_PROFILE": "DEFAULT",
        "OCI_REGION": "us-chicago-1"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OCI_CONFIG_FILE` | Path to OCI config file | No (defaults to ~/.oci/config) |
| `OCI_PROFILE` | Config profile name | No (defaults to DEFAULT) |
| `OCI_TENANCY_OCID` | Tenancy OCID | No (read from config) |
| `OCI_REGION` | OCI region | No (defaults to us-chicago-1) |

## Authentication

Supports two methods:

1. **Session Token** -- uses `security_token_file` from config (recommended for interactive use)
2. **API Key** -- uses RSA key pair with fingerprint (for automation)

## Oracle Cloud Free Tier

| Resource | Free Allocation |
|----------|-----------------|
| Compute (Ampere A1) | 4 OCPUs, 24 GB RAM |
| Compute (AMD E2.1.Micro) | 2 instances |
| Object Storage | 20 GB Standard + 20 GB Archive |
| Block Storage | 200 GB total |
| Autonomous Database | 2 Always Free databases |
| Outbound Data | 10 TB/month |

## Dependencies

- `@modelcontextprotocol/sdk` -- MCP protocol SDK
- `oci-sdk` -- Official Oracle Cloud SDK for Node.js

## License

[MIT](LICENSE)
