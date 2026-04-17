// Round Status Banner
// Reads Supabase rounds.status and updates the page to reflect which rounds are open.
// Drop this script into any landing page that mentions both rounds. It will:
//   1. Show a small banner at the top if a round is full
//   2. Hide/grey out static "Round X: Apr Y-Z" text spans tagged with data-round="round1"|"round2"
//
// Usage: <script src="https://jaygptpro.com/donna-challenge/round-status-banner.js" defer></script>
(function() {
  const SUPABASE_URL = 'https://faqjilunlzljbgrnpcgi.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcWppbHVubHpsamJncm5wY2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjc2NzIsImV4cCI6MjA5MDgwMzY3Mn0.-SOYLYKaGHKYdJKeO0cCWoFKi3HCkJ1jQQtfeS1BZT0';

  function injectBanner(message) {
    if (document.getElementById('round-status-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'round-status-banner';
    banner.style.cssText = `
      position: sticky; top: 0; z-index: 9999;
      background: linear-gradient(135deg, #e87040, #d45a2a);
      color: #fff; text-align: center;
      padding: 10px 20px; font-size: 14px; font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      letter-spacing: 0.2px;
    `;
    banner.textContent = message;
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function strikeRoundText(roundKey) {
    // Hide text spans tagged with data-round
    document.querySelectorAll('[data-round="' + roundKey + '"]').forEach(el => {
      el.style.textDecoration = 'line-through';
      el.style.opacity = '0.5';
    });
  }

  async function checkRoundStatus() {
    try {
      const url = SUPABASE_URL + '/rest/v1/rounds?id=in.(round1,round2)&select=id,status';
      const res = await fetch(url, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      if (!res.ok) return;
      const rounds = await res.json();
      const r1 = rounds.find(r => r.id === 'round1');
      const r2 = rounds.find(r => r.id === 'round2');
      const r1Open = r1 && (r1.status === 'upcoming' || r1.status === 'active');
      const r2Open = r2 && (r2.status === 'upcoming' || r2.status === 'active');

      if (!r1Open && !r2Open) {
        injectBanner('Both rounds are currently full. Email info@jaygptpro.com to be notified when the next round opens.');
      } else if (!r1Open && r2Open) {
        injectBanner('Round 1 is full. New signups are placed in Round 2 (Apr 27 - May 1).');
        strikeRoundText('round1');
      } else if (r1Open && !r2Open) {
        injectBanner('Round 2 is full. New signups are placed in Round 1 (Apr 20-24).');
        strikeRoundText('round2');
      }
      // both open: no banner
    } catch (e) {
      // Silent fail. Static page content remains as fallback.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkRoundStatus);
  } else {
    checkRoundStatus();
  }
})();
