import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { useAuthStore } from '../store/auth';

class McpService {
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;
  private connectPromise: Promise<Client> | null = null;

  /**
   * Menginisiasi atau mengembalikan instance koneksi MCP Server yang aktif.
   */
  async connect(): Promise<Client> {
    if (this.client) return this.client;
    
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      try {
        const token = useAuthStore.getState().token;
        const url = new URL('https://mcp.samkarsa.com/sse');
        
        // Setup SSE transport dengan Bearer token
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        this.transport = new SSEClientTransport(url, {
          requestInit: { headers },
          // @ts-ignore: Some EventSource polyfills support headers
          eventSourceInit: { headers }
        });

        this.client = new Client(
          {
            name: "Blonjo-Web-Client",
            version: "1.0.0"
          },
          {
            capabilities: {}
          }
        );

        await this.client.connect(this.transport);
        
        // Handle disconnect otomatis
        this.transport.onclose = () => {
          console.warn('[MCP] Connection closed, resetting client...');
          this.disconnect();
        };

        return this.client;
      } catch (error) {
        this.connectPromise = null;
        this.client = null;
        throw error;
      }
    })();

    return this.connectPromise;
  }

  /**
   * Menutup koneksi MCP Server
   */
  disconnect() {
    if (this.transport) {
      this.transport.close();
    }
    this.client = null;
    this.transport = null;
    this.connectPromise = null;
  }

  /**
   * Memanggil alat (tool) dari MCP Server secara asinkron.
   */
  async callTool(name: string, args: Record<string, any>) {
    const client = await this.connect();
    const token = useAuthStore.getState().token;
    
    const enrichedArgs = { ...args };
    if (token && !enrichedArgs.token) {
      enrichedArgs.token = token;
      // Gunakan origin dari current window sebagai default host jika tidak disetel
      enrichedArgs.api_url = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8005/api/v1';
    }

    return client.callTool({
      name,
      arguments: enrichedArgs
    });
  }
}

export const mcpClient = new McpService();
