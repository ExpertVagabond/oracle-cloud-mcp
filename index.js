#!/usr/bin/env node

/**
 * Oracle Cloud Infrastructure (OCI) MCP Server
 *
 * Provides Claude Code with access to Oracle Cloud services:
 * - Compute (VM instances, shapes)
 * - Object Storage (buckets, objects)
 * - Block Storage (boot/block volumes)
 * - Networking (VCNs, subnets, security lists)
 * - Autonomous Database (ATP, ADW)
 * - IAM (users, groups, policies)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as oci from "oci-sdk";
import * as fs from "fs";
import * as path from "path";

// Configuration
const CONFIG_FILE = process.env.OCI_CONFIG_FILE || path.join(process.env.HOME, ".oci", "config");
const PROFILE = process.env.OCI_PROFILE || "DEFAULT";
const TENANCY_OCID = process.env.OCI_TENANCY_OCID;
const REGION = process.env.OCI_REGION || "us-chicago-1";

// Initialize OCI clients
let computeClient, objectStorageClient, blockStorageClient,
    virtualNetworkClient, databaseClient, identityClient;

async function initializeClients() {
  try {
    // Try session token auth first, then fall back to API key
    let provider;

    const configFile = fs.readFileSync(CONFIG_FILE, "utf8");
    if (configFile.includes("security_token_file")) {
      // Session token authentication
      provider = new oci.common.SessionAuthDetailProvider(CONFIG_FILE, PROFILE);
    } else {
      // API key authentication
      provider = new oci.common.ConfigFileAuthenticationDetailsProvider(CONFIG_FILE, PROFILE);
    }

    computeClient = new oci.core.ComputeClient({ authenticationDetailsProvider: provider });
    objectStorageClient = new oci.objectstorage.ObjectStorageClient({ authenticationDetailsProvider: provider });
    blockStorageClient = new oci.core.BlockstorageClient({ authenticationDetailsProvider: provider });
    virtualNetworkClient = new oci.core.VirtualNetworkClient({ authenticationDetailsProvider: provider });
    databaseClient = new oci.database.DatabaseClient({ authenticationDetailsProvider: provider });
    identityClient = new oci.identity.IdentityClient({ authenticationDetailsProvider: provider });

    console.error("OCI clients initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize OCI clients:", error.message);
    return false;
  }
}

// Helper to get compartment ID (default to tenancy)
function getCompartmentId(params) {
  return params.compartment_id || TENANCY_OCID || process.env.OCI_TENANCY_OCID;
}

// Tool handlers
const toolHandlers = {
  // ==================== COMPUTE ====================

  async oci_compute_list_instances(params) {
    const response = await computeClient.listInstances({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 50,
    });

    return response.items.map(instance => ({
      id: instance.id,
      displayName: instance.displayName,
      shape: instance.shape,
      lifecycleState: instance.lifecycleState,
      availabilityDomain: instance.availabilityDomain,
      region: instance.region,
      timeCreated: instance.timeCreated,
    }));
  },

  async oci_compute_get_instance(params) {
    const response = await computeClient.getInstance({
      instanceId: params.instance_id,
    });

    return {
      id: response.instance.id,
      displayName: response.instance.displayName,
      shape: response.instance.shape,
      lifecycleState: response.instance.lifecycleState,
      availabilityDomain: response.instance.availabilityDomain,
      faultDomain: response.instance.faultDomain,
      region: response.instance.region,
      imageId: response.instance.imageId,
      timeCreated: response.instance.timeCreated,
      metadata: response.instance.metadata,
      shapeConfig: response.instance.shapeConfig,
    };
  },

  async oci_compute_list_shapes(params) {
    const response = await computeClient.listShapes({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 100,
    });

    return response.items.map(shape => ({
      shape: shape.shape,
      processorDescription: shape.processorDescription,
      ocpus: shape.ocpus,
      memoryInGBs: shape.memoryInGBs,
      networkingBandwidthInGbps: shape.networkingBandwidthInGbps,
      maxVnicAttachments: shape.maxVnicAttachments,
      gpus: shape.gpus,
      isFlexible: shape.isFlexible,
    }));
  },

  async oci_compute_instance_action(params) {
    const response = await computeClient.instanceAction({
      instanceId: params.instance_id,
      action: params.action, // START, STOP, RESET, SOFTSTOP, SOFTRESET
    });

    return {
      id: response.instance.id,
      displayName: response.instance.displayName,
      lifecycleState: response.instance.lifecycleState,
      action: params.action,
    };
  },

  // ==================== OBJECT STORAGE ====================

  async oci_os_get_namespace(params) {
    const response = await objectStorageClient.getNamespace({
      compartmentId: getCompartmentId(params),
    });
    return { namespace: response.value };
  },

  async oci_os_list_buckets(params) {
    const nsResponse = await objectStorageClient.getNamespace({
      compartmentId: getCompartmentId(params),
    });

    const response = await objectStorageClient.listBuckets({
      namespaceName: nsResponse.value,
      compartmentId: getCompartmentId(params),
      limit: params.limit || 100,
    });

    return response.items.map(bucket => ({
      name: bucket.name,
      namespace: bucket.namespace,
      compartmentId: bucket.compartmentId,
      createdBy: bucket.createdBy,
      timeCreated: bucket.timeCreated,
      etag: bucket.etag,
    }));
  },

  async oci_os_create_bucket(params) {
    const nsResponse = await objectStorageClient.getNamespace({
      compartmentId: getCompartmentId(params),
    });

    const response = await objectStorageClient.createBucket({
      namespaceName: nsResponse.value,
      createBucketDetails: {
        name: params.bucket_name,
        compartmentId: getCompartmentId(params),
        publicAccessType: params.public_access || "NoPublicAccess",
        storageTier: params.storage_tier || "Standard",
      },
    });

    return {
      name: response.bucket.name,
      namespace: response.bucket.namespace,
      compartmentId: response.bucket.compartmentId,
      timeCreated: response.bucket.timeCreated,
    };
  },

  async oci_os_list_objects(params) {
    const nsResponse = await objectStorageClient.getNamespace({
      compartmentId: getCompartmentId(params),
    });

    const response = await objectStorageClient.listObjects({
      namespaceName: nsResponse.value,
      bucketName: params.bucket_name,
      prefix: params.prefix,
      limit: params.limit || 100,
    });

    return response.listObjects.objects.map(obj => ({
      name: obj.name,
      size: obj.size,
      md5: obj.md5,
      timeCreated: obj.timeCreated,
      timeModified: obj.timeModified,
    }));
  },

  async oci_os_delete_bucket(params) {
    const nsResponse = await objectStorageClient.getNamespace({
      compartmentId: getCompartmentId(params),
    });

    await objectStorageClient.deleteBucket({
      namespaceName: nsResponse.value,
      bucketName: params.bucket_name,
    });

    return { deleted: true, bucket: params.bucket_name };
  },

  // ==================== BLOCK STORAGE ====================

  async oci_bv_list_volumes(params) {
    const response = await blockStorageClient.listVolumes({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 50,
    });

    return response.items.map(vol => ({
      id: vol.id,
      displayName: vol.displayName,
      sizeInGBs: vol.sizeInGBs,
      lifecycleState: vol.lifecycleState,
      availabilityDomain: vol.availabilityDomain,
      vpusPerGB: vol.vpusPerGB,
      timeCreated: vol.timeCreated,
    }));
  },

  async oci_bv_list_boot_volumes(params) {
    const response = await blockStorageClient.listBootVolumes({
      compartmentId: getCompartmentId(params),
      availabilityDomain: params.availability_domain,
      limit: params.limit || 50,
    });

    return response.items.map(vol => ({
      id: vol.id,
      displayName: vol.displayName,
      sizeInGBs: vol.sizeInGBs,
      lifecycleState: vol.lifecycleState,
      availabilityDomain: vol.availabilityDomain,
      imageId: vol.imageId,
      timeCreated: vol.timeCreated,
    }));
  },

  // ==================== NETWORKING ====================

  async oci_vcn_list(params) {
    const response = await virtualNetworkClient.listVcns({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 50,
    });

    return response.items.map(vcn => ({
      id: vcn.id,
      displayName: vcn.displayName,
      cidrBlock: vcn.cidrBlock,
      cidrBlocks: vcn.cidrBlocks,
      lifecycleState: vcn.lifecycleState,
      dnsLabel: vcn.dnsLabel,
      defaultRouteTableId: vcn.defaultRouteTableId,
      defaultSecurityListId: vcn.defaultSecurityListId,
      timeCreated: vcn.timeCreated,
    }));
  },

  async oci_subnet_list(params) {
    const response = await virtualNetworkClient.listSubnets({
      compartmentId: getCompartmentId(params),
      vcnId: params.vcn_id,
      limit: params.limit || 50,
    });

    return response.items.map(subnet => ({
      id: subnet.id,
      displayName: subnet.displayName,
      cidrBlock: subnet.cidrBlock,
      availabilityDomain: subnet.availabilityDomain,
      lifecycleState: subnet.lifecycleState,
      virtualRouterIp: subnet.virtualRouterIp,
      securityListIds: subnet.securityListIds,
      timeCreated: subnet.timeCreated,
    }));
  },

  async oci_vcn_create(params) {
    const response = await virtualNetworkClient.createVcn({
      createVcnDetails: {
        compartmentId: getCompartmentId(params),
        displayName: params.display_name,
        cidrBlocks: params.cidr_blocks || ["10.0.0.0/16"],
        dnsLabel: params.dns_label,
      },
    });

    return {
      id: response.vcn.id,
      displayName: response.vcn.displayName,
      cidrBlocks: response.vcn.cidrBlocks,
      lifecycleState: response.vcn.lifecycleState,
      timeCreated: response.vcn.timeCreated,
    };
  },

  // ==================== AUTONOMOUS DATABASE ====================

  async oci_adb_list(params) {
    const response = await databaseClient.listAutonomousDatabases({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 50,
    });

    return response.items.map(db => ({
      id: db.id,
      displayName: db.displayName,
      dbName: db.dbName,
      dbWorkload: db.dbWorkload,
      lifecycleState: db.lifecycleState,
      cpuCoreCount: db.cpuCoreCount,
      dataStorageSizeInTBs: db.dataStorageSizeInTBs,
      isFreeTier: db.isFreeTier,
      connectionStrings: db.connectionStrings?.profiles?.map(p => p.displayName),
      timeCreated: db.timeCreated,
    }));
  },

  async oci_adb_get(params) {
    const response = await databaseClient.getAutonomousDatabase({
      autonomousDatabaseId: params.database_id,
    });

    return {
      id: response.autonomousDatabase.id,
      displayName: response.autonomousDatabase.displayName,
      dbName: response.autonomousDatabase.dbName,
      dbWorkload: response.autonomousDatabase.dbWorkload,
      lifecycleState: response.autonomousDatabase.lifecycleState,
      cpuCoreCount: response.autonomousDatabase.cpuCoreCount,
      dataStorageSizeInTBs: response.autonomousDatabase.dataStorageSizeInTBs,
      isFreeTier: response.autonomousDatabase.isFreeTier,
      connectionStrings: response.autonomousDatabase.connectionStrings,
      serviceConsoleUrl: response.autonomousDatabase.serviceConsoleUrl,
      timeCreated: response.autonomousDatabase.timeCreated,
    };
  },

  async oci_adb_start(params) {
    const response = await databaseClient.startAutonomousDatabase({
      autonomousDatabaseId: params.database_id,
    });

    return {
      id: response.autonomousDatabase.id,
      displayName: response.autonomousDatabase.displayName,
      lifecycleState: response.autonomousDatabase.lifecycleState,
      action: "START",
    };
  },

  async oci_adb_stop(params) {
    const response = await databaseClient.stopAutonomousDatabase({
      autonomousDatabaseId: params.database_id,
    });

    return {
      id: response.autonomousDatabase.id,
      displayName: response.autonomousDatabase.displayName,
      lifecycleState: response.autonomousDatabase.lifecycleState,
      action: "STOP",
    };
  },

  // ==================== IAM ====================

  async oci_iam_list_users(params) {
    const response = await identityClient.listUsers({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 100,
    });

    return response.items.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      description: user.description,
      lifecycleState: user.lifecycleState,
      isMfaActivated: user.isMfaActivated,
      timeCreated: user.timeCreated,
    }));
  },

  async oci_iam_list_groups(params) {
    const response = await identityClient.listGroups({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 100,
    });

    return response.items.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      lifecycleState: group.lifecycleState,
      timeCreated: group.timeCreated,
    }));
  },

  async oci_iam_list_policies(params) {
    const response = await identityClient.listPolicies({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 100,
    });

    return response.items.map(policy => ({
      id: policy.id,
      name: policy.name,
      description: policy.description,
      statements: policy.statements,
      lifecycleState: policy.lifecycleState,
      timeCreated: policy.timeCreated,
    }));
  },

  async oci_iam_list_compartments(params) {
    const response = await identityClient.listCompartments({
      compartmentId: getCompartmentId(params),
      limit: params.limit || 100,
      accessLevel: "ANY",
      compartmentIdInSubtree: true,
    });

    return response.items.map(compartment => ({
      id: compartment.id,
      name: compartment.name,
      description: compartment.description,
      lifecycleState: compartment.lifecycleState,
      timeCreated: compartment.timeCreated,
    }));
  },

  async oci_iam_list_availability_domains(params) {
    const response = await identityClient.listAvailabilityDomains({
      compartmentId: getCompartmentId(params),
    });

    return response.items.map(ad => ({
      id: ad.id,
      name: ad.name,
    }));
  },
};

// Tool definitions
const tools = [
  // Compute
  {
    name: "oci_compute_list_instances",
    description: "List all compute instances in a compartment. Shows VM details including shape, state, and availability domain.",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum number of instances to return", default: 50 },
      },
    },
  },
  {
    name: "oci_compute_get_instance",
    description: "Get detailed information about a specific compute instance",
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance OCID" },
      },
      required: ["instance_id"],
    },
  },
  {
    name: "oci_compute_list_shapes",
    description: "List available compute shapes including Always Free shapes (VM.Standard.A1.Flex, VM.Standard.E2.1.Micro)",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum shapes to return", default: 100 },
      },
    },
  },
  {
    name: "oci_compute_instance_action",
    description: "Perform action on a compute instance (START, STOP, RESET, SOFTSTOP, SOFTRESET)",
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "Instance OCID" },
        action: { type: "string", enum: ["START", "STOP", "RESET", "SOFTSTOP", "SOFTRESET"], description: "Action to perform" },
      },
      required: ["instance_id", "action"],
    },
  },

  // Object Storage
  {
    name: "oci_os_get_namespace",
    description: "Get the Object Storage namespace for the tenancy",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
      },
    },
  },
  {
    name: "oci_os_list_buckets",
    description: "List all Object Storage buckets in a compartment (Free Tier: 20GB standard, 20GB archive)",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum buckets to return", default: 100 },
      },
    },
  },
  {
    name: "oci_os_create_bucket",
    description: "Create a new Object Storage bucket",
    inputSchema: {
      type: "object",
      properties: {
        bucket_name: { type: "string", description: "Name for the new bucket" },
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        public_access: { type: "string", enum: ["NoPublicAccess", "ObjectRead", "ObjectReadWithoutList"], default: "NoPublicAccess" },
        storage_tier: { type: "string", enum: ["Standard", "Archive"], default: "Standard" },
      },
      required: ["bucket_name"],
    },
  },
  {
    name: "oci_os_list_objects",
    description: "List objects in a bucket with optional prefix filter",
    inputSchema: {
      type: "object",
      properties: {
        bucket_name: { type: "string", description: "Bucket name" },
        prefix: { type: "string", description: "Filter objects by prefix" },
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum objects to return", default: 100 },
      },
      required: ["bucket_name"],
    },
  },
  {
    name: "oci_os_delete_bucket",
    description: "Delete an empty Object Storage bucket",
    inputSchema: {
      type: "object",
      properties: {
        bucket_name: { type: "string", description: "Bucket name to delete" },
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
      },
      required: ["bucket_name"],
    },
  },

  // Block Storage
  {
    name: "oci_bv_list_volumes",
    description: "List block volumes in a compartment (Free Tier: 200GB total)",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum volumes to return", default: 50 },
      },
    },
  },
  {
    name: "oci_bv_list_boot_volumes",
    description: "List boot volumes in an availability domain",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        availability_domain: { type: "string", description: "Availability domain name" },
        limit: { type: "number", description: "Maximum volumes to return", default: 50 },
      },
    },
  },

  // Networking
  {
    name: "oci_vcn_list",
    description: "List Virtual Cloud Networks (VCNs) in a compartment",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum VCNs to return", default: 50 },
      },
    },
  },
  {
    name: "oci_subnet_list",
    description: "List subnets in a VCN",
    inputSchema: {
      type: "object",
      properties: {
        vcn_id: { type: "string", description: "VCN OCID" },
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum subnets to return", default: 50 },
      },
      required: ["vcn_id"],
    },
  },
  {
    name: "oci_vcn_create",
    description: "Create a new Virtual Cloud Network",
    inputSchema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "Display name for the VCN" },
        cidr_blocks: { type: "array", items: { type: "string" }, description: "CIDR blocks (e.g., ['10.0.0.0/16'])" },
        dns_label: { type: "string", description: "DNS label for the VCN" },
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
      },
      required: ["display_name"],
    },
  },

  // Autonomous Database
  {
    name: "oci_adb_list",
    description: "List Autonomous Databases (ATP/ADW). Free Tier includes 2 Always Free ATP or ADW databases.",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum databases to return", default: 50 },
      },
    },
  },
  {
    name: "oci_adb_get",
    description: "Get detailed information about an Autonomous Database",
    inputSchema: {
      type: "object",
      properties: {
        database_id: { type: "string", description: "Autonomous Database OCID" },
      },
      required: ["database_id"],
    },
  },
  {
    name: "oci_adb_start",
    description: "Start a stopped Autonomous Database",
    inputSchema: {
      type: "object",
      properties: {
        database_id: { type: "string", description: "Autonomous Database OCID" },
      },
      required: ["database_id"],
    },
  },
  {
    name: "oci_adb_stop",
    description: "Stop a running Autonomous Database",
    inputSchema: {
      type: "object",
      properties: {
        database_id: { type: "string", description: "Autonomous Database OCID" },
      },
      required: ["database_id"],
    },
  },

  // IAM
  {
    name: "oci_iam_list_users",
    description: "List IAM users in the tenancy",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum users to return", default: 100 },
      },
    },
  },
  {
    name: "oci_iam_list_groups",
    description: "List IAM groups in the tenancy",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum groups to return", default: 100 },
      },
    },
  },
  {
    name: "oci_iam_list_policies",
    description: "List IAM policies in a compartment",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum policies to return", default: 100 },
      },
    },
  },
  {
    name: "oci_iam_list_compartments",
    description: "List compartments in the tenancy hierarchy",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Parent compartment OCID (defaults to tenancy)" },
        limit: { type: "number", description: "Maximum compartments to return", default: 100 },
      },
    },
  },
  {
    name: "oci_iam_list_availability_domains",
    description: "List availability domains in the region",
    inputSchema: {
      type: "object",
      properties: {
        compartment_id: { type: "string", description: "Compartment OCID (defaults to tenancy)" },
      },
    },
  },
];

// Create and start the server
const server = new Server(
  {
    name: "oracle-cloud-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle call tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;

  if (!toolHandlers[name]) {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    const result = await toolHandlers[name](params || {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  await initializeClients();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Oracle Cloud MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
