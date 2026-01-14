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
}
