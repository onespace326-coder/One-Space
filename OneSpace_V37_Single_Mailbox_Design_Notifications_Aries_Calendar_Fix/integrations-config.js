/* OneSpace Google integration endpoints. Derived from the public Supabase project URL.
 * Provider secrets and refresh tokens are server-side only. Microsoft remains unconfigured. */
(() => {
  const base = String(window.ONESPACE_AUTH_CONFIG?.supabaseUrl || '').replace(/\/$/, '');
  const fn = name => base ? `${base}/functions/v1/${name}` : '';
  window.ONESPACE_INTEGRATION_CONFIG = {
    googleStartUrl: fn('google-oauth-start'),
    statusUrl: fn('google-integration-status'),
    googleSyncUrl: fn('google-sync'),
    googleSendUrl: fn('google-send-OneSpace'),
    googleMailActionUrl: fn('google-mail-action-OneSpace'),
    googleAttachmentUrl: fn('google-mail-attachment'),
    ariesChatUrl: fn('aries-chat'),
    ariesEmailScanUrl: fn('aries-email-scan'),
    ariesHealthUrl: fn('aries-health'),
    ariesApproveReplyUrl: fn('aries-approve-reply')
  };
})();
