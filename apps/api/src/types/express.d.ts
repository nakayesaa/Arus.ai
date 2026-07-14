import type { AuthContext } from '../services/auth.service.js';

declare global {
  namespace Express {
    interface Locals {
      auth?: AuthContext;
      requestId: string;
    }
  }
}

export {};
