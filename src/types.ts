export interface CreationResponse {
  scriptUrl?: string;
  authorizeUrl?: string; // scriptUrl?action=authorize，擁有者首次授權用
  spreadsheetUrl?: string;
  spreadsheetId?: string;
  success?: boolean;
  error?: string;
  tip?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  description?: string;
  scriptUrl?: string; // Parsed from description
  scriptId?: string;  // Parsed from description
  scriptVersion?: string; // Parsed from description (set by custom script)
  isError: boolean;
}
