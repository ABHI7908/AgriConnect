import { api } from './lib/api.js';
import { esc } from './lib/dom.js';
import { initPage } from './lib/session.js';

const LANGUAGE_NAMES = { en: 'English', te: 'తెలుగు', hi: 'हिन्दी' };
const CHAT_TEXT = {
  en: {},
  te: {
    Chats: 'చాట్‌లు',
    'Discuss availability, pricing and work details directly with providers.': 'లభ్యత, ధరలు మరియు పని వివరాల గురించి నేరుగా సేవాదారులతో చర్చించండి.',
    'Chat language': 'చాట్ భాష',
    'Find services': 'సేవలను కనుగొనండి',
    Conversations: 'సంభాషణలు',
    Machine: 'యంత్రం',
    'Labour service': 'కార్మిక సేవ',
    'Welcome message': 'స్వాగత సందేశం',
    'AgriConnect update': 'AgriConnect నవీకరణ',
    'Ask about dates, final price, location, machinery or the work you need.': 'తేదీలు, తుది ధర, ప్రదేశం, యంత్రం లేదా మీ పనికి సంబంధించిన వివరాలు అడగండి.',
    'Hello, is this available for my work? Please share the details…': 'నాకు ఈ సేవ అందుబాటులో ఉందా? దయచేసి వివరాలు తెలియజేయండి…',
    'Start chat': 'చాట్ ప్రారంభించండి',
    'Loading conversations…': 'సంభాషణలు లోడ్ అవుతున్నాయి…',
    'No conversations yet. Open a listing to message a provider.': 'ఇంకా సంభాషణలు లేవు. సేవాదారుకు సందేశం పంపడానికి ఒక జాబితాను తెరవండి.',
    'Select a conversation': 'సంభాషణను ఎంచుకోండి',
    'Open a machine or labour listing and choose “Message provider” to ask a question.': 'ప్రశ్న అడగడానికి యంత్రం లేదా కార్మికుల జాబితాను తెరిచి “సేవాదారుకు సందేశం” ఎంచుకోండి.',
    'Direct calling is available after the booking is accepted. You can discuss details here first.': 'బుకింగ్ ఆమోదించిన తర్వాత నేరుగా కాల్ చేయవచ్చు. ముందుగా ఇక్కడ వివరాలు చర్చించండి.',
    'Ask about availability, price or work details…': 'లభ్యత, ధర లేదా పని వివరాల గురించి అడగండి…',
    Send: 'పంపండి',
    'Call provider': 'సేవాదారుకు కాల్ చేయండి',
    'Call farmer': 'రైతుకు కాల్ చేయండి',
    'Start the conversation about availability, price or the work you need done.': 'లభ్యత, ధర లేదా మీ పనికి సంబంధించిన వివరాల గురించి మాట్లాడటం ప్రారంభించండి.',
    'Voice note': 'వాయిస్ సందేశం',
    'Record voice note': 'వాయిస్ సందేశం రికార్డ్ చేయండి',
    'Stop recording': 'రికార్డింగ్ ఆపండి',
    'Send voice note': 'వాయిస్ సందేశం పంపండి',
    'Recording… maximum 60 seconds': 'రికార్డింగ్… గరిష్ఠంగా 60 సెకన్లు',
    'Voice note ready to send': 'వాయిస్ సందేశం పంపడానికి సిద్ధంగా ఉంది',
    'Microphone access is required to record a voice note.': 'వాయిస్ సందేశం రికార్డ్ చేయడానికి మైక్రోఫోన్ అనుమతి అవసరం.',
    'Voice recording is not supported by this browser.': 'ఈ బ్రౌజర్‌లో వాయిస్ రికార్డింగ్‌కు మద్దతు లేదు.',
    'No audio was recorded. Please try again.': 'ఆడియో రికార్డ్ కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.',
  },
  hi: {
    Chats: 'चैट',
    'Discuss availability, pricing and work details directly with providers.': 'उपलब्धता, कीमत और काम की जानकारी सेवा प्रदाताओं से सीधे पूछें।',
    'Chat language': 'चैट की भाषा',
    'Find services': 'सेवाएँ खोजें',
    Conversations: 'बातचीत',
    Machine: 'मशीन',
    'Labour service': 'श्रम सेवा',
    'Welcome message': 'स्वागत संदेश',
    'AgriConnect update': 'AgriConnect अपडेट',
    'Ask about dates, final price, location, machinery or the work you need.': 'तारीख, अंतिम कीमत, स्थान, मशीन या काम के बारे में पूछें।',
    'Hello, is this available for my work? Please share the details…': 'नमस्ते, क्या यह मेरे काम के लिए उपलब्ध है? कृपया जानकारी दें…',
    'Start chat': 'चैट शुरू करें',
    'Loading conversations…': 'बातचीत लोड हो रही है…',
    'No conversations yet. Open a listing to message a provider.': 'अभी कोई बातचीत नहीं है। प्रदाता को संदेश भेजने के लिए सूची खोलें।',
    'Select a conversation': 'बातचीत चुनें',
    'Open a machine or labour listing and choose “Message provider” to ask a question.': 'सवाल पूछने के लिए मशीन या श्रमिक सूची खोलें और “प्रदाता को संदेश भेजें” चुनें।',
    'Direct calling is available after the booking is accepted. You can discuss details here first.': 'बुकिंग स्वीकार होने के बाद सीधे कॉल कर सकते हैं। पहले यहाँ जानकारी पर चर्चा करें।',
    'Ask about availability, price or work details…': 'उपलब्धता, कीमत या काम की जानकारी पूछें…',
    Send: 'भेजें',
    'Call provider': 'प्रदाता को कॉल करें',
    'Call farmer': 'किसान को कॉल करें',
    'Start the conversation about availability, price or the work you need done.': 'उपलब्धता, कीमत या काम की जानकारी पर बातचीत शुरू करें।',
    'Voice note': 'वॉइस नोट',
    'Record voice note': 'वॉइस नोट रिकॉर्ड करें',
    'Stop recording': 'रिकॉर्डिंग रोकें',
    'Send voice note': 'वॉइस नोट भेजें',
    'Recording… maximum 60 seconds': 'रिकॉर्डिंग… अधिकतम 60 सेकंड',
    'Voice note ready to send': 'वॉइस नोट भेजने के लिए तैयार है',
    'Microphone access is required to record a voice note.': 'वॉइस नोट रिकॉर्ड करने के लिए माइक्रोफ़ोन की अनुमति आवश्यक है।',
    'Voice recording is not supported by this browser.': 'यह ब्राउज़र वॉइस रिकॉर्डिंग का समर्थन नहीं करता।',
    'No audio was recorded. Please try again.': 'ऑडियो रिकॉर्ड नहीं हुआ। कृपया फिर से कोशिश करें।',
  },
};

const user = await initPage('chats', { requireUser: true });
if (!user || !['farmer', 'owner'].includes(user.role)) {
  if (user) location.replace('/');
} else {
  const listHost = document.getElementById('chat-list');
  const currentHost = document.getElementById('chat-current');
  const params = new URLSearchParams(location.search);
  const languageSelect = document.getElementById('chat-language');
  let language = 'en';
  try {
    const savedLanguage = localStorage.getItem('agriconnect-language');
    if (['en', 'te', 'hi'].includes(savedLanguage)) language = savedLanguage;
  } catch { /* Use English when browser storage is unavailable. */ }
  let newChatTarget = null;
  let activeId = null;
  let loadingMessages = false;
  let lastMessageId = 0;
  let lastRenderedLanguage = language;
  let recorder = null;
  let recordedVoice = null;
  let voicePreviewUrl = null;
  let recordingTimer = null;
  let refreshTimer;

  const money = (value, unit) => value == null
    ? ''
    : `₹${Number(value).toLocaleString('en-IN')} ${unit}`;
  const formatTime = (value) => value ? new Date(value).toLocaleString() : '';
  const text = (phrase) => CHAT_TEXT[language]?.[phrase] || phrase;
  const languageLabel = (code) => LANGUAGE_NAMES[code] || LANGUAGE_NAMES.en;

  function clearVoicePreview() {
    const preview = currentHost.querySelector('.chat-voice-preview');
    if (preview) {
      preview.pause();
      preview.removeAttribute('src');
      preview.load();
      preview.classList.add('hidden');
    }
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    voicePreviewUrl = null;
    recordedVoice = null;
  }

  async function startVoiceRecording() {
    const status = currentHost.querySelector('[data-voice-status]');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error(text('Voice recording is not supported by this browser.'));
    }
    clearVoicePreview();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const chunks = [];
      const activeRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder = activeRecorder;
      activeRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      activeRecorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop());
        recordedVoice = chunks.length ? new Blob(chunks, { type: activeRecorder.mimeType || chunks[0].type }) : null;
        if (recordedVoice?.size) {
          const preview = currentHost.querySelector('.chat-voice-preview');
          if (!preview) return;
          voicePreviewUrl = URL.createObjectURL(recordedVoice);
          preview.src = voicePreviewUrl;
          preview.classList.remove('hidden');
          currentHost.querySelector('[data-send-voice]').classList.remove('hidden');
          status.textContent = text('Voice note ready to send');
        } else if (status.isConnected) {
          status.textContent = text('No audio was recorded. Please try again.');
        }
        if (status.isConnected) {
          currentHost.querySelector('[data-record-voice]').classList.remove('hidden');
          currentHost.querySelector('[data-stop-voice]').classList.add('hidden');
        }
      }, { once: true });
      activeRecorder.start();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
    currentHost.querySelector('[data-record-voice]').classList.add('hidden');
    currentHost.querySelector('[data-stop-voice]').classList.remove('hidden');
    status.textContent = text('Recording… maximum 60 seconds');
    recordingTimer = window.setTimeout(() => {
      if (recorder?.state === 'recording') recorder.stop();
    }, 60_000);
  }

  function applyLanguage() {
    languageSelect.value = language;
    document.documentElement.lang = language;
    document.querySelectorAll('[data-chat-text]').forEach((element) => {
      const phrase = element.dataset.chatText;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.placeholder = text(phrase);
      } else element.textContent = text(phrase);
    });
    if (activeId) loadMessages();
    else if (newChatTarget) showNewChat(newChatTarget.kind, newChatTarget.listingId);
    const messageLanguage = currentHost.querySelector('.chat-message-language');
    if (messageLanguage) messageLanguage.textContent = languageLabel(language);
  }

  languageSelect.addEventListener('change', () => {
    language = languageSelect.value;
    try { localStorage.setItem('agriconnect-language', language); } catch { /* Chat language remains selected for this page. */ }
    applyLanguage();
  });
  applyLanguage();

  function updateUrl(key, value) {
    const next = new URL(location.href);
    next.searchParams.delete('kind');
    next.searchParams.delete('listingId');
    next.searchParams.delete('chat');
    next.searchParams.delete('booking');
    if (key && value) next.searchParams.set(key, value);
    history.replaceState(null, '', next);
  }

  async function loadChats() {
    const data = await api.get('/communications/chats');
    if (!data.items.length) {
      listHost.innerHTML = `<p class="chat-list-empty">${esc(text('No conversations yet. Open a listing to message a provider.'))}</p>`;
      return;
    }
    listHost.innerHTML = data.items.map((item) => `
      <button class="chat-list-item ${String(item.id) === String(activeId) ? 'selected' : ''}"
        type="button" data-chat-id="${esc(item.id)}">
        <span class="chat-list-item-top"><strong>${esc(item.otherName)}</strong>
          ${Number(item.unread_count) ? `<span class="chat-unread">${esc(item.unread_count)}</span>` : ''}
        </span>
        <span class="chat-list-listing">${esc(item.listing_title)} · ${esc(text(item.kind === 'tool' ? 'Machine' : 'Labour service'))}</span>
        <span class="chat-list-preview">${esc(item.last_message || 'Conversation started')}</span>
        <time>${esc(formatTime(item.last_message_at))}</time>
      </button>`).join('');
  }

  async function openChat(id) {
    if (recorder?.state === 'recording') recorder.stop();
    window.clearTimeout(recordingTimer);
    recorder = null;
    clearVoicePreview();
    activeId = String(id);
    lastMessageId = 0;
    currentHost.dataset.chatId = '';
    updateUrl('chat', activeId);
    currentHost.innerHTML = `<div class="chat-empty">${esc(text('Loading conversations…'))}</div>`;
    await loadChats();
    await loadMessages();
  }

  async function loadMessages() {
    if (!activeId || loadingMessages || document.hidden) return;
    loadingMessages = true;
    try {
      const data = await api.get(`/communications/chats/${encodeURIComponent(activeId)}/messages`);
      const changed = (data.items.at(-1)?.id || 0) !== lastMessageId || lastRenderedLanguage !== language;
      const context = data.chat;
      const phone = context.callPhone;
      if (currentHost.dataset.chatId !== activeId) {
        currentHost.dataset.chatId = activeId;
        currentHost.innerHTML = `
          <header class="chat-conversation-head">
            <div class="chat-head-context"></div><div class="chat-contact-actions"></div>
          </header>
          <p class="chat-call-note ${user.role === 'farmer' ? '' : 'hidden'}"></p>
          <div class="conversation chat-messages" id="chat-messages"></div>
          <form class="conversation-form chat-compose">
            <label class="sr-only" for="chat-message">Your message</label>
            <textarea id="chat-message" name="body" rows="2" maxlength="2000" placeholder="${esc(text('Ask about availability, price or work details…'))}"></textarea>
            <div class="chat-compose-actions">
              <span class="chat-message-language">${esc(languageLabel(language))}</span>
              <button class="btn dark" type="submit">${esc(text('Send'))}</button>
            </div>
            <div class="chat-voice-controls">
              <button class="btn small ghost" type="button" data-record-voice>${esc(text('Record voice note'))}</button>
              <button class="btn small ghost hidden" type="button" data-stop-voice>${esc(text('Stop recording'))}</button>
              <button class="btn small hidden" type="button" data-send-voice>${esc(text('Send voice note'))}</button>
              <span class="chat-voice-status muted" data-voice-status role="status" aria-live="polite"></span>
              <audio class="chat-voice-preview hidden" controls></audio>
            </div>
          </form>`;
      }
      currentHost.querySelector('.chat-head-context').innerHTML = `
        <span class="badge neutral">${esc(text(context.kind === 'tool' ? 'Machine' : 'Labour service'))}</span>
        <h2>${esc(context.listingTitle)}</h2><p>${esc(context.providerName)}</p>`;
      currentHost.querySelector('.chat-contact-actions').innerHTML = `
        ${phone ? `<a class="btn small" href="tel:${esc(phone)}">${esc(text(user.role === 'farmer' ? 'Call provider' : 'Call farmer'))}</a>` : ''}
        <a class="btn small ghost" href="/">${esc(text('Find services'))}</a>`;
      const composer = currentHost.querySelector('.chat-compose');
      composer.elements.body.placeholder = text('Ask about availability, price or work details…');
      composer.querySelector('button[type="submit"]').textContent = text('Send');
      composer.querySelector('[data-record-voice]').textContent = text('Record voice note');
      composer.querySelector('[data-stop-voice]').textContent = text('Stop recording');
      composer.querySelector('[data-send-voice]').textContent = text('Send voice note');
      composer.querySelector('.chat-message-language').textContent = languageLabel(language);
      const callNote = currentHost.querySelector('.chat-call-note');
      if (callNote) {
        callNote.textContent = text('Direct calling is available after the booking is accepted. You can discuss details here first.');
        callNote.classList.toggle('hidden', user.role !== 'farmer' || Boolean(phone));
      }
      if (changed) {
        const box = currentHost.querySelector('#chat-messages');
        box.innerHTML = data.items.length ? data.items.map((message) => `
          <article class="conversation-message ${message.isMine ? 'mine' : ''} ${message.isSystem ? 'system' : ''}">
            <div class="conversation-message-meta"><strong>${esc(message.senderName || (message.senderRole === 'farmer' ? 'Farmer' : 'Provider'))}</strong>
              <span>${message.isSystem ? esc(text('AgriConnect update')) : esc(languageLabel(message.language))}</span>
              <time>${esc(formatTime(message.createdAt))}</time></div>
            ${message.body ? `<p>${esc(message.body)}</p>` : ''}
            ${message.hasAudio ? `<audio controls preload="none" src="/api/communications/chats/${encodeURIComponent(activeId)}/messages/${encodeURIComponent(message.id)}/audio"></audio><span class="voice-language">${esc(text('Voice note'))} · ${esc(languageLabel(message.language))}</span>` : ''}
          </article>`).join('') : `<p class="conversation-empty">${esc(text('Start the conversation about availability, price or the work you need done.'))}</p>`;
        box.scrollTop = box.scrollHeight;
        lastRenderedLanguage = language;
      }
      lastMessageId = data.items.at(-1)?.id || 0;
      await api.post(`/communications/chats/${encodeURIComponent(activeId)}/messages/read`, {});
      await loadChats();
      window.dispatchEvent(new Event('agri-notifications-refresh'));
    } catch (err) {
      const messageBox = currentHost.querySelector('.chat-messages');
      if (messageBox) messageBox.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
      else currentHost.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    } finally {
      loadingMessages = false;
    }
  }

  async function showNewChat(kind, listingId) {
    newChatTarget = { kind, listingId };
    const query = new URLSearchParams({ kind, listingId });
    const { listing } = await api.get(`/communications/chats/listing?${query}`);
    const prices = listing.kind === 'tool'
      ? [money(listing.prices.perDay, 'per day'), money(listing.prices.perHour, 'per hour'), money(listing.prices.perAcre, 'per acre')].filter(Boolean).join(' · ')
      : `${money(listing.prices.perPersonPerDay, 'per person / day')} · team of ${esc(listing.prices.teamSize)}`;
    const availability = listing.available ? 'Currently marked available' : 'Currently marked unavailable';
    currentHost.innerHTML = `
      <header class="chat-conversation-head">
        <div><span class="badge neutral">${esc(text(listing.kind === 'tool' ? 'Machine' : 'Labour service'))}</span>
          <h2>${esc(listing.title)}</h2><p>${esc(listing.providerName)}</p></div>
      </header>
      <div class="chat-listing-context"><strong>${esc(availability)}</strong>${prices ? `<span>${esc(prices)}</span>` : ''}
        <p>${esc(text('Ask about dates, final price, location, machinery or the work you need.'))}</p></div>
      <form class="conversation-form chat-compose" id="new-chat-form">
        <label class="sr-only" for="chat-first-message">Your first message</label>
        <textarea id="chat-first-message" name="body" rows="3" maxlength="2000"
          placeholder="${esc(text('Hello, is this available for my work? Please share the details…'))}" required></textarea>
        <div class="chat-compose-actions"><span class="chat-message-language">${esc(languageLabel(language))}</span>
          <button class="btn dark" type="submit">${esc(text('Start chat'))}</button></div>
        <p class="form-error hidden" role="alert"></p>
      </form>`;
    currentHost.querySelector('#new-chat-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const error = form.querySelector('.form-error');
      button.disabled = true;
      error.classList.add('hidden');
      try {
        const result = await api.post('/communications/chats', {
          kind: listing.kind,
          listingId: listing.id,
          body: form.elements.body.value.trim(),
          language,
        });
        await loadChats();
        await openChat(result.id);
      } catch (err) {
        error.textContent = err.message;
        error.classList.remove('hidden');
        button.disabled = false;
      }
    });
  }

  listHost.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chat-id]');
    if (button) openChat(button.dataset.chatId).catch((err) => {
      currentHost.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    });
  });

  currentHost.addEventListener('submit', async (event) => {
    if (!event.target.matches('.chat-compose') || event.target.id === 'new-chat-form') return;
    event.preventDefault();
    const form = event.target;
    const body = form.elements.body.value.trim();
    const button = form.querySelector('button[type="submit"]');
    if (!body || button.disabled) return;
    button.disabled = true;
    try {
      await api.post(`/communications/chats/${encodeURIComponent(activeId)}/messages`, { body, language });
      form.reset();
      await loadMessages();
    } catch (err) {
      window.alert(err.message);
    } finally {
      button.disabled = false;
    }
  });

  currentHost.addEventListener('click', async (event) => {
    const recordButton = event.target.closest('[data-record-voice]');
    const stopButton = event.target.closest('[data-stop-voice]');
    const sendButton = event.target.closest('[data-send-voice]');
    if (recordButton) {
      const status = currentHost.querySelector('[data-voice-status]');
      recordButton.disabled = true;
      try {
        await startVoiceRecording();
      } catch (error) {
        status.textContent = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
          ? text('Microphone access is required to record a voice note.')
          : error.message;
      } finally {
        recordButton.disabled = false;
      }
    } else if (stopButton && recorder?.state === 'recording') {
      window.clearTimeout(recordingTimer);
      recorder.stop();
    } else if (sendButton && recordedVoice && activeId) {
      const form = new FormData();
      const extension = recordedVoice.type.includes('ogg') ? 'ogg'
        : recordedVoice.type.includes('mp4') ? 'mp4' : 'webm';
      form.append('voice', recordedVoice, `voice-note.${extension}`);
      form.append('language', language);
      sendButton.disabled = true;
      try {
        await api.postForm(`/communications/chats/${encodeURIComponent(activeId)}/voice`, form);
        clearVoicePreview();
        sendButton.classList.add('hidden');
        currentHost.querySelector('[data-voice-status]').textContent = '';
        await loadMessages();
      } catch (error) {
        currentHost.querySelector('[data-voice-status]').textContent = error.message;
      } finally {
        sendButton.disabled = false;
      }
    }
  });

  try {
    await loadChats();
    const kind = params.get('kind');
    const listingId = params.get('listingId');
    const chatId = params.get('chat');
    const bookingId = params.get('booking');
    if (kind && listingId && user.role === 'farmer') await showNewChat(kind, listingId);
    else if (bookingId) {
      const { id } = await api.get(`/communications/chats/booking/${encodeURIComponent(bookingId)}`);
      await openChat(id);
    }
    else if (chatId) await openChat(chatId);
    refreshTimer = window.setInterval(() => {
      loadChats().catch((err) => console.error('Could not refresh chats:', err.message));
      loadMessages();
    }, 5000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        loadChats().catch((err) => console.error('Could not refresh chats:', err.message));
        loadMessages();
      }
    });
  } catch (err) {
    clearInterval(refreshTimer);
    listHost.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
  }
}
