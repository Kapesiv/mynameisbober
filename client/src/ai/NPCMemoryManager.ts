interface ConversationEntry {
  npcId: string;
  timestamp: number;
  playerMessage: string;
  npcResponse: string;
}

const DB_NAME = 'vaultborn-npc-memory';
const STORE_NAME = 'conversations';
const DB_VERSION = 1;
const MAX_HISTORY = 8;

export class NPCMemoryManager {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('npcId', 'npcId', { unique: false });
          store.createIndex('npcId_timestamp', ['npcId', 'timestamp'], { unique: false });
        }
      };

      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  async getHistory(npcId: string): Promise<ConversationEntry[]> {
    await this.open();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('npcId');
      const req = index.getAll(npcId);

      req.onsuccess = () => {
        const results = req.result as ConversationEntry[];
        results.sort((a, b) => a.timestamp - b.timestamp);
        resolve(results.slice(-MAX_HISTORY));
      };

      req.onerror = () => reject(req.error);
    });
  }

  async addEntry(npcId: string, playerMessage: string, npcResponse: string): Promise<void> {
    await this.open();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const entry: ConversationEntry = {
        npcId,
        timestamp: Date.now(),
        playerMessage,
        npcResponse,
      };

      const req = store.add(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  formatHistoryForChat(history: ConversationEntry[]): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const entry of history) {
      messages.push({ role: 'user', content: entry.playerMessage });
      messages.push({ role: 'assistant', content: entry.npcResponse });
    }
    return messages;
  }
}
