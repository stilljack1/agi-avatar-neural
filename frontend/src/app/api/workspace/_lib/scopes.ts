export const GOOGLE_WORKSPACE_SCOPES = {
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
  gmailModify: 'https://www.googleapis.com/auth/gmail.modify',
  driveReadonly: 'https://www.googleapis.com/auth/drive.readonly',
  docsReadonly: 'https://www.googleapis.com/auth/documents.readonly',
  sheetsReadonly: 'https://www.googleapis.com/auth/spreadsheets.readonly',
} as const;

export interface WorkspaceCapabilities {
  gmailRead: boolean;
  gmailWrite: boolean;
  driveRead: boolean;
  docsRead: boolean;
  sheetsRead: boolean;
}

export function deriveCapabilities(scopes: string[]): WorkspaceCapabilities {
  return {
    gmailRead: scopes.includes(GOOGLE_WORKSPACE_SCOPES.gmailReadonly) || scopes.includes(GOOGLE_WORKSPACE_SCOPES.gmailModify),
    gmailWrite: scopes.includes(GOOGLE_WORKSPACE_SCOPES.gmailSend) || scopes.includes(GOOGLE_WORKSPACE_SCOPES.gmailModify),
    driveRead: scopes.includes(GOOGLE_WORKSPACE_SCOPES.driveReadonly),
    docsRead: scopes.includes(GOOGLE_WORKSPACE_SCOPES.docsReadonly),
    sheetsRead: scopes.includes(GOOGLE_WORKSPACE_SCOPES.sheetsReadonly),
  };
}

export function hasScopes(scopes: string[], required: string[]): boolean {
  return required.every((scope) => scopes.includes(scope));
}
