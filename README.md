# Oracle Cloud Infrastructure MCP Server

MCP server for Oracle Cloud Infrastructure (OCI) integration with Claude Code. Provides comprehensive access to OCI services including Compute, Storage, Networking, Database, and IAM.

## Features

- **Compute** - List, manage, and control VM instances
- **Object Storage** - Manage buckets and objects
- **Block Storage** - List block and boot volumes
- **Networking** - VCNs, subnets, and network management
- **Autonomous Database** - ATP/ADW database operations
- **IAM** - Users, groups, policies, and compartments

## Available Tools (21 total)

### Compute (4 tools)
| Tool | Description |
|------|-------------|
| `oci_compute_list_instances` | List all compute instances in a compartment |
| `oci_compute_get_instance` | Get detailed info about a specific instance |
| `oci_compute_list_shapes` | List available shapes (incl. Always Free) |
| `oci_compute_instance_action` | Perform actions (START, STOP, RESET, etc.) |

### Object Storage (5 tools)
| Tool | Description |
|------|-------------|
| `oci_os_get_namespace` | Get the Object Storage namespace |
| `oci_os_list_buckets` | List all buckets in compartment |
| `oci_os_create_bucket` | Create a new bucket |
| `oci_os_list_objects` | List objects in a bucket |
| `oci_os_delete_bucket` | Delete an empty bucket |

### Block Storage (2 tools)
| Tool | Description |
|------|-------------|
| `oci_bv_list_volumes` | List block volumes |
| `oci_bv_list_boot_volumes` | List boot volumes |

### Networking (3 tools)
| Tool | Description |
|------|-------------|
| `oci_vcn_list` | List Virtual Cloud Networks |
| `oci_subnet_list` | List subnets in a VCN |
| `oci_vcn_create` | Create a new VCN |

### Autonomous Database (4 tools)
| Tool | Description |
|------|-------------|
| `oci_adb_list` | List Autonomous Databases |
| `oci_adb_get` | Get database details |
| `oci_adb_start` | Start a stopped database |
| `oci_adb_stop` | Stop a running database |

### IAM (5 tools)
| Tool | Description |
|------|-------------|
| `oci_iam_list_users` | List IAM users |
| `oci_iam_list_groups` | List IAM groups |
| `oci_iam_list_policies` | List IAM policies |
| `oci_iam_list_compartments` | List compartments |
| `oci_iam_list_availability_domains` | List availability domains |

## Setup

### 1. Install Dependencies

```bash
cd ~/mcp-servers/oracle-mcp
npm install
```

### 2. Configure OCI

Ensure you have OCI CLI configured with a valid config file:

```bash
# ~/.oci/config should contain:
[DEFAULT]
user=ocid1.user.oc1..xxx
fingerprint=xx:xx:xx:xx:xx
tenancy=ocid1.tenancy.oc1..xxx
region=us-chicago-1
key_file=~/.oci/api_keys/oci_api_key.pem
```

Or use session token authentication:
```bash
oci session authenticate
```

### 3. Add to Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "oracle": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/matthewkarsten/mcp-servers/oracle-mcp/index.js"],
      "env": {
        "OCI_CONFIG_FILE": "/Users/matthewkarsten/.oci/config",
        "OCI_PROFILE": "DEFAULT",
        "OCI_REGION": "us-chicago-1"
      }
    }
  }
}
```

## Free Tier Resources

Oracle Cloud Free Tier includes:

| Resource | Free Allocation |
|----------|-----------------|
| Compute (Ampere A1) | 4 OCPUs, 24 GB RAM |
| Compute (AMD E2.1.Micro) | 2 instances |
| Object Storage | 20 GB Standard + 20 GB Archive |
| Block Storage | 200 GB total |
| Autonomous Database | 2 Always Free databases |
| Outbound Data | 10 TB/month |

## Architecture

```
Claude Code (Opus 4.5)
         │
         └──▶ Oracle MCP Server
                    │
                    └──▶ OCI SDK
                              │
                              ├── Compute Service
                              ├── Object Storage
                              ├── Block Storage
                              ├── Virtual Network
                              ├── Database Service
                              └── Identity Service
```

## Authentication

The server supports two authentication methods:

1. **Session Token** (recommended for interactive use)
   - Uses `security_token_file` from config
   - Refreshable with `oci session refresh`

2. **API Key** (for automation)
   - Uses RSA key pair
   - Requires fingerprint in OCI config

## Usage Examples

```
User: List my OCI compute instances

Claude: [Uses oci_compute_list_instances tool]
Result:
- web-server-1 (VM.Standard.A1.Flex) - RUNNING
- db-server (VM.Standard.E2.1.Micro) - STOPPED

User: Start the db-server instance

Claude: [Uses oci_compute_instance_action with action=START]
Result: Instance db-server is now starting...
```

## Files

- `index.js` - MCP server implementation
- `package.json` - Dependencies
- `README.md` - This file

## Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK
- `oci-sdk` - Official Oracle Cloud SDK

## Author

Matthew Karsten

## License

MIT
