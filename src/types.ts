export interface CreationResponse {
  scriptUrl?: string;
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
  isError: boolean;
}
