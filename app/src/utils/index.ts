export const openAuthPopup = (url: string) => {
  const width = 500;
  const height = 600;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;
  const newWin = window.open(url, 'GoogleAuth', `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`);
  if (newWin) newWin.focus();
};

export const getScriptUrlFromDescription = (description?: string): string | null => {
  if (!description) return null;
  try {
    const meta = JSON.parse(description);
    return meta.scriptUrl || null;
  } catch {
    return null;
  }
};
