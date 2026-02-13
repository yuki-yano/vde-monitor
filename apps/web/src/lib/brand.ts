export const APP_DISPLAY_NAME = "VDE Monitor";

export const buildSessionDocumentTitle = (sessionTitle?: null | string): string => {
  const normalizedSessionTitle = sessionTitle?.trim();
  if (!normalizedSessionTitle) {
    return APP_DISPLAY_NAME;
  }
  return `${normalizedSessionTitle} - ${APP_DISPLAY_NAME}`;
};
