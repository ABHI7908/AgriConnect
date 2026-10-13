import { api } from './api.js';
import { esc } from './dom.js';

function notificationLink(role, notification) {
  if (notification.chat_id) return `/chats?chat=${encodeURIComponent(notification.chat_id)}`;
  if (!notification.booking_id) return `/${role}`;
  return `/${role}?openBooking=${encodeURIComponent(notification.booking_id)}#${role === 'owner' ? 'requests' : 'bookings'}`;
}

export function initNotificationCenter(host, role) {
  if (!host) return;
  host.innerHTML = `
    <button class="notification-toggle" type="button" aria-label="Notifications" aria-expanded="false" aria-controls="notification-panel">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path></svg>
      <span class="notification-count hidden" aria-live="polite"></span>
    </button>
    <section class="notification-panel hidden" id="notification-panel" aria-label="Notifications">
      <div class="notification-panel-head"><strong>Notifications</strong><button type="button" class="link" data-notifications-read>Mark all read</button></div>
      <div class="notification-items" aria-live="polite"></div>
    </section>`;

  const toggle = host.querySelector('.notification-toggle');
  const panel = host.querySelector('.notification-panel');
  const count = host.querySelector('.notification-count');
  const itemsHost = host.querySelector('.notification-items');
  const readAllButton = host.querySelector('[data-notifications-read]');
  let loading = false;
  let refreshPending = false;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('hidden', !open);
  };

  const refresh = async () => {
    if (document.hidden) return;
    if (loading) {
      refreshPending = true;
      return;
    }
    loading = true;
    try {
      const data = await api.get('/communications/notifications');
      const unread = Number(data.unreadCount) || 0;
      const unreadItems = data.items.filter((item) => !item.read_at);
      count.textContent = unread > 99 ? '99+' : String(unread);
      count.classList.toggle('hidden', unread === 0);
      toggle.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
      if (!unreadItems.length) {
        itemsHost.innerHTML = '<p class="notification-empty">You are all caught up.</p>';
        return;
      }
      itemsHost.innerHTML = unreadItems.map((item) => `
        <a class="notification-item unread" href="${notificationLink(role, item)}" data-notification-id="${encodeURIComponent(item.id)}">
          <span class="notification-item-title">${esc(item.title)}</span>
          <span class="notification-item-body">${esc(item.body)}</span>
          <time datetime="${esc(item.created_at)}">${esc(new Date(item.created_at).toLocaleString())}</time>
        </a>`).join('');
    } catch (err) {
      console.error('Could not refresh AgriConnect notifications:', err.message);
    } finally {
      loading = false;
      if (refreshPending) {
        refreshPending = false;
        void refresh();
      }
    }
  };

  toggle.addEventListener('click', async () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    if (open) await refresh();
  });
  itemsHost.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-notification-id]');
    if (item) {
      event.preventDefault();
      try {
        await api.post(`/communications/notifications/${item.dataset.notificationId}/read`, {});
        window.location.assign(item.href);
      } catch (err) {
        console.error('Could not mark notification as read:', err.message);
      }
    }
  });
  readAllButton.addEventListener('click', async () => {
    readAllButton.disabled = true;
    try {
      await api.post('/communications/notifications/read-all', {});
      count.textContent = '';
      count.classList.add('hidden');
      toggle.setAttribute('aria-label', 'Notifications');
      itemsHost.innerHTML = '<p class="notification-empty">You are all caught up.</p>';
      await refresh();
    } catch (err) {
      console.error('Could not mark notifications as read:', err.message);
    } finally {
      readAllButton.disabled = false;
    }
  });
  document.addEventListener('click', (event) => {
    if (!host.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  window.addEventListener('agri-notifications-refresh', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.setInterval(refresh, 30000);
  refresh();
}
