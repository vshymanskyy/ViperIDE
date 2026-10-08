import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs";
import path from "path";
import http from "http";

const mcpJsonPath = "/home/jos/stubs_playground/.vscode/mcp.json";
const mcpJsonRaw = fs.readFileSync(mcpJsonPath, "utf-8");
console.log("mcp.json parses successfully:", !!JSON.parse(mcpJsonRaw));

const mcpConfig = JSON.parse(mcpJsonRaw);
const serverConfig = mcpConfig.servers.viperIDE;

// Substitute workspaceFolder:stubs_playground with /home/jos/stubs_playground
const workspaceSub = "/home/jos/stubs_playground";

const command = serverConfig.command;
const args = serverConfig.args.map(arg => arg.replace(/\$\{workspaceFolder:stubs_playground\}/g, workspaceSub));
const env = {};
for (const [key, val] of Object.entries(serverConfig.env || {})) {
  env[key] = val.replace(/\$\{workspaceFolder:stubs_playground\}/g, workspaceSub);
}
// Merge process env too
Object.assign(env, process.env);

console.log("Command details:");
console.log("- Command:", command);
console.log("- Args:", args);
console.log("- Env VIPERIDE_BUILD_DIR:", env.VIPERIDE_BUILD_DIR);

const transport = new StdioClientTransport({
  command: command,
  args: args,
  env: env
});

const client = new Client({
  name: "test-client",
  version: "1.0.0"
}, {
  capabilities: {}
});

async function run() {
  console.log("Connecting to standard I/O MCP server...");
  await client.connect(transport);
  console.log("Connected successfully!");

  // Call the viperIDE_get_status tool or tool listing to find the call.
  // First list tools:
  const tools = await client.listTools();
  console.log("Tools available:", tools.tools.map(t => t.name));

  console.log("Calling viperIDE_get_status...");
  const result = await client.callTool({
    name: "viperIDE_get_status",
    arguments: {}
  });

  console.log("Result content:", JSON.stringify(result, null, 2));
  
  // Find ideUrl from result
  let ideUrl = null;
  if (result.content && Array.isArray(result.content)) {
    for (const c of result.content) {
      if (c.type === "text" && c.text) {
        // Try parsing JSON if the output is JSON
        try {
          const parsed = JSON.parse(c.text);
          if (parsed.ideUrl) {
            ideUrl = parsed.ideUrl;
          }
        } catch (e) {
          // Check if string contains ideUrl
          const match = c.text.match(/ideUrl["']?\s*:\s*["']([^"']+)["']/);
          if (match) {
            ideUrl = match[1];
          }
        }
      }
    }
  }

  if (!ideUrl) {
    throw new Error("Could not find ideUrl from viperIDE_get_status result.");
  }
  
  console.log("Extracted ideUrl:", ideUrl);

  // Make http request to ideUrl and check if it serves HTML
  console.log("Making HTTP request to:", ideUrl);
  await new Promise((resolve, reject) => {
    http.get(ideUrl, (res) => {
      console.log(`HTTP Status Code: ${res.statusCode}`);
      console.log(`HTTP Headers:`, res.headers);
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const containsHTML = data.toLowerCase().includes("<!doctype html>") || data.toLowerCase().includes("<html");
        console.log("Server serves HTML:", containsHTML);
        if (containsHTML) {
          console.log("HTML response matched! Sample:", data.slice(0, 200).replace(/\n/g, " "));
          resolve();
        } else {
          reject(new Error("Response does not look like ViperIDE HTML: " + data.slice(0, 100)));
        }
      });
    }).on("error", (err) => {
      reject(err);
    });
  });

  console.log("All validated correctly. Closing client...");
  await client.close();
  console.log("Client closed.");
}

run().catch(err => {
  console.error("Error running test:", err);
  process.exit(1);
});
