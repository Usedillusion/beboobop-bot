import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as chrono from 'chrono-node';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  FileUploadBuilder,
  GatewayIntentBits,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';

// ============================================================================
// 1. JSON STORAGE & IN-MEMORY DRAFTS
// ============================================================================
const DB_FILE = 'events.json';
const DEFAULT_TIMEZONE = 'Europe/London';
const AUTO_THREAD_LEAD_MINUTES = 15;
const BACKED_OUT_WINDOW_SECONDS = 30 * 60;
const GUIDES_CHANNEL_ID = '1334819504387260467';
const GUIDES_CHANNEL_URL = 'https://discord.com/channels/1217794860359221368/1334819504387260467';
const CREATE_EVENT_BUTTON_ID = 'quick_create_event';
const pendingDrafts = new Map();
const pendingAttendeeAdds = new Map();
const channelPromptMessages = new Map();
const channelSortQueues = new Map();

const COLOR_PRESETS = [
  { label: 'Discord Blurple', value: '5865F2', emoji: '🟦' },
  { label: 'Emerald Green', value: '57F287', emoji: '🟩' },
  { label: 'Gold / Amber', value: 'FEE75C', emoji: '🟨' },
  { label: 'Tangerine Orange', value: 'F39C12', emoji: '🟧' },
  { label: 'Crimson Red', value: 'ED4245', emoji: '🟥' },
  { label: 'Hot Pink', value: 'EB459E', emoji: '🩷' },
  { label: 'Royal Purple', value: '9B59B6', emoji: '🟪' },
  { label: 'Lavender', value: 'B39DDB', emoji: '🪻' },
  { label: 'Cyan / Teal', value: '1ABC9C', emoji: '🩵' },
  { label: 'Mint Aqua', value: '2ECC71', emoji: '🌿' },
  { label: 'Coral Sunset', value: 'FF7043', emoji: '🌅' },
  { label: 'Slate Steel', value: '607D8B', emoji: '🩶' },
];

const TAG_OPTIONS = [
  { label: 'No Tag', value: 'none', emoji: '🔇' },
  { label: '@raids', value: 'raids', emoji: '⚔️' },
  { label: '@dungeons', value: 'dungeons', emoji: '🗝️' },
];

// Auto-matched banner images by raid/dungeon/pantheon keyword & variations
// (used when no custom image URL or uploaded file is provided)
const ACTIVITY_IMAGES = [
  {
    keywords: [
      'epic desert perpetual',
      'epic dp',
      'edp',
      'dp epic',
      'desert perpetual epic',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573453485830176878/all-disabled-items-destiny-2-desert-perpetual-epic-raid-race-1.png?ex=6b021040&is=6b00bec0&hm=34ddd11acf3539b6ae5f6c4c106e9b1dd7f0f329c0cf713477fde93e6735866f&',
  },
  {
    keywords: [
      'desert perpetual',
      'the desert perpetual',
      'dp',
    ],
    url: 'https://cdn.discordapp.com/attachments/1403673556226801707/1403673556595769393/the-desert-perpetual-raid-guide-destiny-2_feature.jpg?ex=6b020f1e&is=6b00bd9e&hm=0cc8c3439ec999b09338a1a7d12d65e0e8dba9e28733e65bc18c18790b26125c&',
  },
  {
    keywords: [
      "salvation's edge",
      'salvations edge',
      'salvation edge',
      'se',
      'witness',
      'the witness',
    ],
    url: 'https://cdn.discordapp.com/attachments/1335182512011477042/1335182512393027628/IMG_7786.webp?ex=6b020f5d&is=6b00bddd&hm=3426b16c6d440db53b30b0bd6adb90d09b9f9c0d0d8e424d6ea7bbe3f83c2eba&',
  },
  {
    keywords: [
      'vow of the disciple',
      'vow of disciple',
      'vow',
      'votd',
      'disciple',
      'rhulk',
    ],
    url: 'https://cdn.discordapp.com/attachments/1335181436763766824/1335181437128933489/IMG_7780.jpg?ex=6b020e5d&is=6b00bcdd&hm=2018fcd3d0dc32bb9775ee88365eb4d68245a888fd4669453d533132b7aff12c&',
  },
  {
    keywords: [
      'root of nightmares',
      'root of nightmare',
      'root',
      'ron',
      'nezarec',
    ],
    url: 'https://cdn.discordapp.com/attachments/1335181585581867028/1335181585850568724/IMG_7781.webp?ex=6b020e80&is=6b00bd00&hm=eb4bb2e6584f52051e210cf289f3d7aa55a4d6a34962e125617dcc716e934146&',
  },
  {
    keywords: [
      'deep stone crypt',
      'deep stone',
      'dsc',
      'crypt',
      'taniks',
      'atraks',
    ],
    url: 'https://cdn.discordapp.com/attachments/1335181181066678304/1335181181322268723/IMG_7779.jpg?ex=6b020e20&is=6b00bca0&hm=e81889979dd0dca729f3a4a3a84b816fc0ca533aa3a88073a51633909777cadd&',
  },
  {
    keywords: [
      "king's fall",
      'kings fall',
      'king fall',
      'kf',
      'oryx',
    ],
    url: 'https://cdn.discordapp.com/attachments/1335182006534930432/1335182007034056744/IMG_7736.webp?ex=6b020ee4&is=6b00bd64&hm=57c3dcb809c2c938065630e1e6d20358d7e19457ebd4ca44c84fffc4dbd2ee84&',
  },
  {
    keywords: [
      "crota's end",
      'crotas end',
      'crota end',
      'crota',
      'ce',
    ],
    url: 'https://cdn.discordapp.com/attachments/1335182313524297789/1335182313851457577/IMG_7785.jpg?ex=6b020f2e&is=6b00bdae&hm=da65aac1f38dee012b724228af2dbb77da794ad254544e118d07560da0029dd1&',
  },
  {
    keywords: [
      'vault of glass',
      'vault',
      'vog',
      'atheon',
    ],
    url: 'https://cdn.discordapp.com/attachments/1335181894756864011/1335181894953992262/IMG_7782.jpg?ex=6b020eca&is=6b00bd4a&hm=d8db9fa669e667a6ec3f3bfb09a90273ea70ab868e96adc8506550489acf5b56&',
  },
  {
    keywords: [
      'last wish',
      'lw',
      'riven',
    ],
    url: 'https://cdn.discordapp.com/attachments/1334819849658175499/1334819849918091305/IMG_7772.webp?ex=6b020f1b&is=6b00bd9b&hm=a54d0540cdcc8318b847fb8583304659536e377d43ce007546879d52b9b9a7f4&',
  },
  {
    keywords: [
      'garden of salvation',
      'garden',
      'gos',
      'sanctified mind',
    ],
    url: 'https://cdn.discordapp.com/attachments/1334918802068078662/1334918802265079912/IMG_7777.jpg?ex=6b01c284&is=6b007104&hm=dce7b37fe826acb7a4215c9c0994f1c10c1eb38aa0602b88180a76448a2668ee&',
  },
  {
    keywords: [
      'pantheon calus resplendent',
      'calus resplendent',
      'pantheon calus',
      'pcr',
      'resplendent',
      'calus',
      'pantheon morgeth surpassing',
      'morgeth surpassing',
      'pantheon morgeth',
      'pms',
      'surpassing',
      'morgeth',
      'pantheon insurrection prime',
      'insurrection prime',
      'pantheon insurrection',
      'pip',
      'insurrection',
      'pantheon',
    ],
    url: 'https://cdn.discordapp.com/attachments/1551871287696166962/1551871288056881162/Pantheon_Header.png?ex=6b01fd83&is=6b00ac03&hm=35bb2e25b1d89072b75b14d8d1485f6ae945fe7e497b3372cd36144cfd9ec04f&',
  },
  {
    keywords: [
      'leviathan',
      'the leviathan',
      'levi',
    ],
    url: 'https://cdn.discordapp.com/attachments/1551869129202343937/1551869130175414313/Leviathan_Raid_Thumb.png?ex=6b01fb80&is=6b00aa00&hm=0a4e3067db76d7e930e54f04d35dcd90494f7e6b096478294444c7236c072ba5&',
  },
  {
    keywords: [
      'eater of worlds',
      'eater of world',
      'eater',
      'eow',
      'argos',
    ],
    url: 'https://cdn.discordapp.com/attachments/1551869604114993223/1551869608716271646/resize.png?ex=6b01fbf3&is=6b00aa73&hm=4f434a5c6c3056b8a3e61161477f535ee3cd1da0f190250aaf4f2da85fb3a0e3&',
  },
  {
    keywords: [
      'spire of stars',
      'spire of star',
      'sos',
      'ca uor',
      "ca'uor",
    ],
    url: 'https://cdn.discordapp.com/attachments/1551869804246466620/1551869804389077102/SpireofStarsTEMP.png?ex=6b01fc21&is=6b00aaa1&hm=08ce306240746e6898a3d22cd7efb632ca25ddc3165cf788ecf3bea5b485ea63&',
  },
  {
    keywords: [
      'scourge of the past',
      'scourge of past',
      'scourge',
      'sotp',
    ],
    url: 'https://cdn.discordapp.com/attachments/1551869994927792150/1551869995150082111/Past.png?ex=6b01fc4f&is=6b00aacf&hm=4cf1c33341ad8154064ae1f31aa8a96cfcba89600f551fc33a715693dcd1011c&',
  },
  {
    keywords: [
      'crown of sorrow',
      'crown of sorrows',
      'crown',
      'cos',
      'gahlran',
    ],
    url: 'https://cdn.discordapp.com/attachments/1551870189778243685/1551870189967118377/COS.png?ex=6b01fc7d&is=6b00aafd&hm=28250cd93a4f2ef8656f32dfa3719caa15faaac5dfb8b1e19e43b7cf3dea249e&',
  },
  {
    keywords: [
      'equilibrium',
      'eq',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573455046971105322/1200px-EquilibriumTemple.webp.png?ex=6b0211b4&is=6b00c034&hm=51daa790dbbea876a80ad5cc8e8be9fc4b2ae56b633daba702f8d1bb60aaa99f&',
  },
  {
    keywords: [
      'sundered doctrine',
      'sundered',
      'doctrine',
      'sd',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573455223895105768/SunderedDoctrineArt.png?ex=6b0211de&is=6b00c05e&hm=86e45a7410c42305c2bffddea9527ed458742ac78750c7e5d2b68041a573643d&',
  },
  {
    keywords: [
      "vesper's host",
      'vespers host',
      'vesper host',
      'vespers',
      'vesper',
      'vh',
      'raneiks',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573455376823885885/2024_Vespers_Host_Press_Kit_Wallpapers_COMPRESSED_003.png?ex=6b021203&is=6b00c083&hm=4f2f2f1b322e0a97eda4426638257a13e22e25e050f49750001f641e3dbeb2e8&',
  },
  {
    keywords: [
      "warlord's ruin",
      'warlords ruin',
      'warlord ruin',
      'warlords',
      'warlord',
      'wr',
      'vrhasi',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573455497460195398/58cljqarns3c1.png?ex=6b02121f&is=6b00c09f&hm=d69373f0449fcf8c839655f8eed3ee6dcabeb3c90894e8b0504bedd1ecf2d245&',
  },
  {
    keywords: [
      'ghosts of the deep',
      'ghost of the deep',
      'ghosts of deep',
      'ghosts',
      'gotd',
      'simmumah',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573455629329371227/1200px-GhostsOfTheDeepMAIN.png?ex=6b02123f&is=6b00c0bf&hm=e9c8bdde56147feb71edb9423b9b15580f51ec5fd3aa13bb36ccbed5bd8e5539&',
  },
  {
    keywords: [
      'spire of the watcher',
      'spire of watcher',
      'watcher',
      'sotw',
      'persys',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573455773554708520/1200px-WATCHERdungeon.png?ex=6b021261&is=6b00c0e1&hm=3981df01dd6e8c58dd48d8bfa6f55e0a37948fb222c4ecc73d0f514f256eec39&',
  },
  {
    keywords: [
      'duality',
      'du',
      'caiatl',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573455952412409937/duality-dungeon-guide-destiny-2_feature.png?ex=6b02128c&is=6b00c10c&hm=8500b3b5bab0a565d00e4c05eb8985b112500e5cc77db7d8dfa1234c0ced5475&',
  },
  {
    keywords: [
      'grasp of avarice',
      'grasp',
      'avarice',
      'goa',
      'avarikus',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573456126379299028/1200px-GraspofAvariceMain.png?ex=6b0212b5&is=6b00c135&hm=a9e62ee42ae7e2190de9c8ad83115b2e2aeff0493e11162ba44eafb3c3afd406&',
  },
  {
    keywords: [
      'prophecy',
      'pr',
      'kell echo',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573456261608116250/1200px-Prophecy5.png?ex=6b0212d6&is=6b00c156&hm=0012029c3d4c2c0f9c8c89ff3d69d8fd77a7b15b81f4f0c1227c0f2d57cbb74d&',
  },
  {
    keywords: [
      'pit of heresy',
      'pit',
      'heresy',
      'poh',
      'zulmak',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573456385453072554/1200px-PitofHersey2.png?ex=6b0212f3&is=6b00c173&hm=2811da40823ec886da430bac29d26fdd20cb957517924851fad3d93823d749f5&',
  },
  {
    keywords: [
      'shattered throne',
      'shattered',
      'throne',
      'st',
      'dul incaru',
      'dûl incaru',
    ],
    url: 'https://cdn.discordapp.com/attachments/1563341774666334428/1573456554072477716/1200px-ShatteredThrone1.png?ex=6b02131b&is=6b00c19b&hm=d03556c4e1ebb94af514a7238d62dc33741532b308dac980acfc5821a8b19122&',
  },
];

function normalizeTitle(str) {
  return (str ?? '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesKeyword(normalizedTitle, rawKeyword) {
  const kw = normalizeTitle(rawKeyword);
  if (!kw) return false;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`);
  return regex.test(normalizedTitle);
}

function resolveEventImage(title, customImageUrl) {
  if (customImageUrl && isValidImageUrl(customImageUrl)) {
    return customImageUrl.trim();
  }
  const normalized = normalizeTitle(title);
  if (!normalized) return null;

  for (const entry of ACTIVITY_IMAGES) {
    if (entry.keywords.some((kw) => matchesKeyword(normalized, kw))) {
      return entry.url;
    }
  }
  return null;
}

function isImageAttachment(attachment) {
  if (!attachment) return false;
  if (attachment.contentType && attachment.contentType.startsWith('image/')) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(attachment.name ?? '');
}

function getActorDisplayName(interactionOrMember, user = null) {
  const member = interactionOrMember?.member ?? interactionOrMember;
  const resolvedUser = user ?? interactionOrMember?.user ?? member?.user ?? null;
  const name =
    member?.displayName ??
    resolvedUser?.globalName ??
    resolvedUser?.username ??
    null;
  return name ? String(name).trim() : null;
}

function escapeMarkdownLinkText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function formatParticipantLabel(signup) {
  const cleanName = escapeMarkdownLinkText(signup?.display_name);
  if (cleanName) {
    return `[${cleanName}](https://discord.com/users/${signup.user_id})`;
  }
  return `<@${signup.user_id}>`;
}

function loadStore() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { events: {}, signups: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { events: {}, signups: {} };
  }
}

function saveStore(store) {
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
}

function createEvent(event) {
  const store = loadStore();
  store.events[event.id] = { ...event, message_id: null, thread_id: null, reminded: 0 };
  store.signups[event.id] = {};
  saveStore(store);
}

function updatePublishedEvent(eventId, updates) {
  const store = loadStore();
  const ev = store.events[eventId];
  if (!ev) return null;

  ev.title = updates.title;
  ev.when_raw = updates.when_raw;
  ev.start_unix = updates.start_unix;
  ev.description = updates.description;
  ev.accepted_cap = updates.accepted_cap;
  saveStore(store);
  return ev;
}

function deleteEventRecord(eventId) {
  const store = loadStore();
  const ev = store.events[eventId];
  if (!ev) return null;

  delete store.events[eventId];
  delete store.signups[eventId];
  saveStore(store);
  return ev;
}

function setEventMessageAndThread(eventId, messageId, threadId) {
  const store = loadStore();
  if (!store.events[eventId]) return;
  store.events[eventId].message_id = messageId;
  if (threadId !== undefined) {
    store.events[eventId].thread_id = threadId ?? null;
  }
  saveStore(store);
}

function updateSignupDisplayName(eventId, userId, displayName) {
  if (!displayName) return;
  const store = loadStore();
  const entry = store.signups?.[eventId]?.[userId];
  if (!entry || entry.display_name === displayName) return;
  entry.display_name = displayName;
  saveStore(store);
}

function getEventWithDetails(eventId) {
  const store = loadStore();
  const event = store.events[eventId];
  if (!event) return null;

  const signupsMap = store.signups[eventId] ?? {};
  const signups = Object.values(signupsMap).sort((a, b) => a.signed_up_at - b.signed_up_at);
  return { event, signups };
}

function hasEventsInChannel(channelId) {
  const store = loadStore();
  return Object.values(store.events).some((ev) => ev.channel_id === channelId);
}

function promoteNextWaitlist(store, eventId) {
  const event = store.events[eventId];
  if (!event || event.accepted_cap <= 0) return null;

  const signupsMap = store.signups[eventId] ?? {};
  const acceptedCount = Object.values(signupsMap).filter((s) => s.status === 'accepted').length;
  if (acceptedCount >= event.accepted_cap) return null;

  const next = Object.values(signupsMap)
    .filter((s) => s.status === 'waitlist')
    .sort((a, b) => a.signed_up_at - b.signed_up_at)[0];

  if (!next) return null;

  next.status = 'accepted';
  return next.user_id;
}

function isWithinBackedOutWindow(event, nowUnix = Math.floor(Date.now() / 1000)) {
  if (!event || typeof event.start_unix !== 'number') return false;
  return event.start_unix - nowUnix <= BACKED_OUT_WINDOW_SECONDS;
}

function handleSignupAction(eventId, action, userId, hasSherpaRole, displayName = null) {
  const store = loadStore();
  const event = store.events[eventId];
  if (!event) return { ok: false, message: 'Event no longer exists.' };

  store.signups[eventId] ??= {};
  const signupsMap = store.signups[eventId];
  const existing = signupsMap[userId];
  const resolvedName = displayName || existing?.display_name || null;
  const nowUnix = Math.floor(Date.now() / 1000);
  const within30Min = isWithinBackedOutWindow(event, nowUnix);
  let promotedUserId = null;

  // 1. Accepted button clicked
  if (action === 'accepted') {
    if (existing && (existing.status === 'accepted' || existing.status === 'waitlist')) {
      const wasAccepted = existing.status === 'accepted';
      if (wasAccepted && within30Min) {
        existing.status = 'backed_out';
        existing.is_sherpa = 0;
        existing.moved_from_accepted = false;
        if (resolvedName) existing.display_name = resolvedName;
      } else {
        delete signupsMap[userId];
      }
      saveStore(store);

      if (wasAccepted) {
        promotedUserId = promoteNextWaitlist(store, eventId);
        saveStore(store);
      }

      return {
        ok: true,
        message:
          wasAccepted && within30Min
            ? 'You left **Accepted** within 30 minutes of start and were moved to **Backed-out**.'
            : 'Removed you from **Accepted**.',
        promotedUserId,
      };
    }

    const acceptedCount = Object.values(signupsMap).filter((s) => s.status === 'accepted').length;
    const targetStatus =
      event.accepted_cap === 0 || acceptedCount < event.accepted_cap ? 'accepted' : 'waitlist';
    const sherpaFlag = hasSherpaRole ? 1 : 0;

    signupsMap[userId] = {
      event_id: eventId,
      user_id: userId,
      display_name: resolvedName,
      status: targetStatus,
      is_sherpa: sherpaFlag,
      moved_from_accepted: false,
      signed_up_at: Date.now(),
    };
    saveStore(store);

    return {
      ok: true,
      message: sherpaFlag
        ? targetStatus === 'accepted'
          ? 'Sherpa detected! Moved you to **Accepted** and **Sherpa**.'
          : 'Accepted is full — moved you to **Waitlist** and **Sherpa**.'
        : targetStatus === 'accepted'
        ? 'Moved you to **Accepted**!'
        : 'Accepted is full — added you to the **Waitlist**.',
      promotedUserId: null,
    };
  }

  // 2. Fillers button clicked
  if (action === 'fillers') {
    if (existing?.status === 'fillers') {
      delete signupsMap[userId];
      saveStore(store);
      return { ok: true, message: 'Removed you from **Fillers**.', promotedUserId: null };
    }

    const wasAccepted = existing?.status === 'accepted';
    const shouldMarkMoved = wasAccepted || Boolean(existing?.moved_from_accepted);

    signupsMap[userId] = {
      event_id: eventId,
      user_id: userId,
      display_name: resolvedName,
      status: 'fillers',
      is_sherpa: 0,
      moved_from_accepted: shouldMarkMoved,
      signed_up_at: Date.now(),
    };

    if (wasAccepted) {
      promotedUserId = promoteNextWaitlist(store, eventId);
    }

    saveStore(store);

    return {
      ok: true,
      message: shouldMarkMoved
        ? 'Moved you to **Fillers** as `(moved)`!'
        : 'Moved you to **Fillers**!',
      promotedUserId,
    };
  }

  return { ok: false, message: 'Unknown signup action.' };
}

function adminAddUserToSlot(eventId, targetUserId, targetSlot, targetHasSherpaRole, targetDisplayName = null) {
  const store = loadStore();
  const event = store.events[eventId];
  if (!event) return { ok: false, message: 'Event no longer exists.' };

  store.signups[eventId] ??= {};
  const signupsMap = store.signups[eventId];
  const existing = signupsMap[targetUserId];
  const resolvedName = targetDisplayName || existing?.display_name || null;
  let promotedUserId = null;

  if (targetSlot === 'fillers') {
    const wasAccepted = existing?.status === 'accepted';
    const shouldMarkMoved = wasAccepted || Boolean(existing?.moved_from_accepted);

    signupsMap[targetUserId] = {
      event_id: eventId,
      user_id: targetUserId,
      display_name: resolvedName,
      status: 'fillers',
      is_sherpa: 0,
      moved_from_accepted: shouldMarkMoved,
      signed_up_at: existing?.signed_up_at ?? Date.now(),
    };

    if (wasAccepted) {
      promotedUserId = promoteNextWaitlist(store, eventId);
    }

    saveStore(store);
    return {
      ok: true,
      message: shouldMarkMoved
        ? `Added <@${targetUserId}> to **Fillers** as \`(moved)\`.`
        : `Added <@${targetUserId}> to **Fillers**.`,
      promotedUserId,
    };
  }

  // Default / 'accepted' slot
  if (existing?.status === 'accepted') {
    if (resolvedName && existing.display_name !== resolvedName) {
      existing.display_name = resolvedName;
      saveStore(store);
    }
    return { ok: true, message: `<@${targetUserId}> is already in **Accepted**.`, promotedUserId: null };
  }

  const acceptedCount = Object.values(signupsMap).filter((s) => s.status === 'accepted').length;
  const resolvedStatus =
    event.accepted_cap === 0 || acceptedCount < event.accepted_cap ? 'accepted' : 'waitlist';
  const sherpaFlag = targetHasSherpaRole ? 1 : 0;

  signupsMap[targetUserId] = {
    event_id: eventId,
    user_id: targetUserId,
    display_name: resolvedName,
    status: resolvedStatus,
    is_sherpa: sherpaFlag,
    moved_from_accepted: false,
    signed_up_at: existing?.signed_up_at ?? Date.now(),
  };

  saveStore(store);
  return {
    ok: true,
    message:
      resolvedStatus === 'accepted'
        ? `Added <@${targetUserId}> to **Accepted**${sherpaFlag ? ' (Sherpa)' : ''}.`
        : `Accepted is full — added <@${targetUserId}> to the **Waitlist**${sherpaFlag ? ' (Sherpa)' : ''}.`,
    promotedUserId: null,
  };
}

function adminRemoveUser(eventId, userId) {
  const store = loadStore();
  const event = store.events[eventId];
  if (!event) return { ok: false, message: 'Event not found.' };

  store.signups[eventId] ??= {};
  const signupsMap = store.signups[eventId];
  const existing = signupsMap[userId];
  if (!existing) {
    return { ok: false, message: `<@${userId}> is not signed up on this event.` };
  }

  const oldStatus = existing.status;
  delete signupsMap[userId];
  let promotedUserId = null;

  if (oldStatus === 'accepted') {
    promotedUserId = promoteNextWaitlist(store, eventId);
  }

  saveStore(store);
  return { ok: true, message: `Removed <@${userId}> from **${oldStatus}**.`, promotedUserId };
}

function getDueEvents(nowUnix) {
  const store = loadStore();
  return Object.values(store.events).filter(
    (ev) => ev.reminded === 0 && ev.start_unix - AUTO_THREAD_LEAD_MINUTES * 60 <= nowUnix
  );
}

function markEventReminded(eventId) {
  const store = loadStore();
  if (store.events[eventId]) {
    store.events[eventId].reminded = 1;
    saveStore(store);
  }
}

// ============================================================================
// 2. NATURAL TIMEZONE PARSER & HELPERS
// ============================================================================
function getTimezoneOffsetMinutes(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const match = tzPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2], 10);
    const mins = parseInt(match[3] ?? '0', 10);
    return sign * (hours * 60 + mins);
  } catch {
    return null;
  }
}

function parseNaturalStartTime(input, timeZone = DEFAULT_TIMEZONE) {
  const trimmed = input.trim();
  if (/^\d{10}$/.test(trimmed)) return Number(trimmed);
  if (/^\d{13}$/.test(trimmed)) return Math.floor(Number(trimmed) / 1000);

  const offsetMins = getTimezoneOffsetMinutes(timeZone) ?? 0;
  const refInstant = new Date();
  const parsedDate = chrono.parseDate(
    trimmed,
    { instant: refInstant, timezone: offsetMins },
    { forwardDate: true }
  );

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;
  return Math.floor(parsedDate.getTime() / 1000);
}

function parseHexColor(input) {
  if (!input) return null;
  const cleaned = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

function isValidImageUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function findTagRole(guild, tagKey) {
  if (!guild || (tagKey !== 'raids' && tagKey !== 'dungeons')) return null;
  return guild.roles.cache.find((r) => r.name.toLowerCase() === tagKey) ?? null;
}

function formatTagDisplay(guild, tagKey) {
  if (tagKey !== 'raids' && tagKey !== 'dungeons') return '*None*';
  const role = findTagRole(guild, tagKey);
  return role ? `<@&${role.id}>` : `@${tagKey}`;
}

function canManageEvent(interaction, event) {
  if (!event) return false;
  if (interaction.user.id === event.host_id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = interaction.member?.roles?.cache;
  if (roles && roles.some((r) => r.name.toLowerCase() === 'admin')) return true;
  return false;
}

function canManageAttendees(interaction, event) {
  if (!event) return false;
  if (canManageEvent(interaction, event)) return true;
  const roles = interaction.member?.roles?.cache;
  if (roles && roles.some((r) => r.name.toLowerCase() === 'sherpa')) return true;
  return false;
}

function memberHasSherpaRole(member) {
  if (!member?.roles?.cache) return false;
  return member.roles.cache.some((r) => r.name.toLowerCase() === 'sherpa');
}

// ============================================================================
// 3. SLASH COMMAND DEFINITIONS & DEPLOYMENT (--deploy flag)
// ============================================================================
const commands = [
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Open the event builder popup'),

  new SlashCommandBuilder()
    .setName('event-clear')
    .setDescription('[Admin] Remove a user from Backed-out (or any slot) on an event')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('event_id').setDescription('The 8-character Event ID from the embed footer').setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to clear from the event').setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

if (process.argv.includes('--deploy')) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

  console.log('Registering slash commands...');
  await rest.put(route, { body: commands });
  console.log('Slash commands registered!');
  process.exit(0);
}

// ============================================================================
// 4. MODALS, BUILDER PREVIEW & EVENT EMBED
// ============================================================================
function buildEventDetailsModal(draft = {}) {
  const modal = new ModalBuilder()
    .setCustomId(draft.draftId ? `event_modal:edit:${draft.draftId}` : 'event_modal:create')
    .setTitle(draft.draftId ? 'Edit Event Details' : 'Create Event');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Event Title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. King's Fall or Salvation's Edge")
    .setRequired(true)
    .setMaxLength(120);
  if (draft.title) titleInput.setValue(draft.title);

  const whenInput = new TextInputBuilder()
    .setCustomId('when')
    .setLabel('When (e.g. "Tomorrow at 6pm", "Fri 8pm")')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Tomorrow at 6pm')
    .setRequired(true)
    .setMaxLength(60);
  if (draft.whenRaw) whenInput.setValue(draft.whenRaw);

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Add rules, voice channel, prep notes, etc.')
    .setRequired(false)
    .setMaxLength(1000);
  if (draft.description) descInput.setValue(draft.description);

  const capInput = new TextInputBuilder()
    .setCustomId('cap')
    .setLabel('Accepted Cap (0 = unlimited)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('0')
    .setRequired(false)
    .setMaxLength(4);
  if (typeof draft.acceptedCap === 'number') capInput.setValue(String(draft.acceptedCap));

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(whenInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(capInput)
  );

  return modal;
}

function buildPublishedEditModal(event) {
  const modal = new ModalBuilder()
    .setCustomId(`event_modal:live_edit:${event.id}`)
    .setTitle('Edit Published Event');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Event Title')
    .setStyle(TextInputStyle.Short)
    .setValue(event.title)
    .setRequired(true)
    .setMaxLength(120);

  const whenInput = new TextInputBuilder()
    .setCustomId('when')
    .setLabel('When (e.g. "Tomorrow at 6pm", "Fri 8pm")')
    .setStyle(TextInputStyle.Short)
    .setValue(event.when_raw || String(event.start_unix))
    .setRequired(true)
    .setMaxLength(60);

  const descInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(event.description || 'Click a button below to RSVP.')
    .setRequired(false)
    .setMaxLength(1000);

  const capInput = new TextInputBuilder()
    .setCustomId('cap')
    .setLabel('Accepted Cap (0 = unlimited)')
    .setStyle(TextInputStyle.Short)
    .setValue(String(event.accepted_cap ?? 0))
    .setRequired(false)
    .setMaxLength(4);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(whenInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(capInput)
  );

  return modal;
}

function buildAppearanceModal(draft) {
  const modal = new ModalBuilder()
    .setCustomId(`event_modal:appearance:${draft.draftId}`)
    .setTitle('Event Image');

  const fileUpload = new FileUploadBuilder()
    .setCustomId('image_file')
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false);

  const fileLabel = new LabelBuilder()
    .setLabel('Upload Image (Phone / PC)')
    .setDescription('Pick an image from your gallery or PC files (optional)')
    .setFileUploadComponent(fileUpload);

  const imageInput = new TextInputBuilder()
    .setCustomId('image_url')
    .setLabel('Or Paste Image URL')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://example.com/banner.png')
    .setRequired(false)
    .setMaxLength(500);
  if (draft.imageUrl) imageInput.setValue(draft.imageUrl);

  modal.addLabelComponents(fileLabel);
  modal.addComponents(new ActionRowBuilder().addComponents(imageInput));

  return modal;
}

function buildAttendeeManagerPayload(eventId, eventTitle, selectedSlot = 'accepted') {
  const slotRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`attendees:${eventId}:slot`)
      .setPlaceholder('Choose destination group')
      .addOptions(
        {
          label: 'Accepted (or Waitlist if full)',
          value: 'accepted',
          emoji: '✅',
          default: selectedSlot === 'accepted',
        },
        {
          label: 'Fillers',
          value: 'fillers',
          emoji: '🪑',
          default: selectedSlot === 'fillers',
        }
      )
  );

  const userRow = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`attendees:${eventId}:add_user`)
      .setPlaceholder(
        selectedSlot === 'fillers'
          ? 'Select a member to add to Fillers...'
          : 'Select a member to add to Accepted...'
      )
      .setMinValues(1)
      .setMaxValues(1)
  );

  return {
    content:
      `**Manage Attendees — ${eventTitle}**\n` +
      `Pick whether to add a server member to **Accepted** or **Fillers**, then choose the member below:`,
    components: [slotRow, userRow],
  };
}

function buildDraftCustomizerPayload(draftId, draft, guild = null) {
  const embedColor = parseHexColor(draft.colorHex) ?? 0x5865f2;
  const effectiveImage = resolveEventImage(draft.title, draft.imageUrl);

  const previewEmbed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(draft.title)
    .setDescription(
      `${draft.description}\n\n` +
      `📅 **When:** <t:${draft.startUnix}:F> (<t:${draft.startUnix}:R>)\n` +
      `👑 **Host:** <@${draft.hostId}>\n` +
      `📚 **New to this activity?** Check out <#${GUIDES_CHANNEL_ID}> ([Open Link](${GUIDES_CHANNEL_URL}))\n` +
      `📣 **Publish Tag:** ${formatTagDisplay(guild, draft.tagOption)}\n` +
      `🌍 **Timezone:** \`${draft.timeZone}\` *("${draft.whenRaw}")*\n` +
      `🧵 **Auto Lobby:** Thread created 15m before start (pings Accepted + Fillers if below cap)`
    )
    .addFields(
      {
        name: `✅ Accepted [${draft.acceptedCap > 0 ? `0/${draft.acceptedCap}` : '0'}]`,
        value: '*None*',
        inline: true,
      },
      {
        name: '📖 Sherpa [0]',
        value: '*None*',
        inline: true,
      },
      {
        name: '🪑 Fillers [0]',
        value: '*None*',
        inline: true,
      },
      {
        name: '🚫 Backed-out [0]',
        value: '*None*',
        inline: false,
      }
    )
    .setFooter({ text: 'Private Builder Preview — Only you can see this until you click Post Event' });

  if (effectiveImage) {
    previewEmbed.setImage(effectiveImage);
  }

  const colorRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`draft:${draftId}:color_preset`)
      .setPlaceholder(`Embed Color: #${draft.colorHex} (or pick a preset)`)
      .addOptions(
        COLOR_PRESETS.map((c) => ({
          label: c.label,
          value: c.value,
          emoji: c.emoji,
          default: draft.colorHex.toUpperCase() === c.value,
        }))
      )
  );

  const tagRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`draft:${draftId}:tag_option`)
      .setPlaceholder('Publish Tag: None, @raids, or @dungeons')
      .addOptions(
        TAG_OPTIONS.map((t) => ({
          label: t.label,
          value: t.value,
          emoji: t.emoji,
          default: (draft.tagOption ?? 'none') === t.value,
        }))
      )
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`draft:${draftId}:publish`)
      .setLabel('Post Event')
      .setEmoji('🚀')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`draft:${draftId}:edit_details`)
      .setLabel('Edit Details')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`draft:${draftId}:appearance`)
      .setLabel('Image')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`draft:${draftId}:cancel`)
      .setLabel('Cancel')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    content: '**Event Builder** — pick an embed color, image, and `@raids` / `@dungeons` tag below, then hit **Post Event**:',
    embeds: [previewEmbed],
    components: [colorRow, tagRow, actionsRow],
  };
}

function buildEventPayload(eventId, includePublishPing = false, guild = null) {
  const data = getEventWithDetails(eventId);
  if (!data) return null;

  const { event, signups } = data;

  const accepted = signups.filter((s) => s.status === 'accepted');
  const waitlist = signups.filter((s) => s.status === 'waitlist');
  const sherpas = signups.filter(
    (s) => s.is_sherpa === 1 && (s.status === 'accepted' || s.status === 'waitlist')
  );
  const fillers = signups.filter((s) => s.status === 'fillers');
  const backedOut = signups.filter((s) => s.status === 'backed_out');

  const capLabel = event.accepted_cap > 0 ? `${accepted.length}/${event.accepted_cap}` : `${accepted.length}`;

  const formatNumberedCompact = (list) =>
    list.length > 0
      ? list.map((u, i) => `${i + 1}. ${formatParticipantLabel(u)}${u.is_sherpa ? ' 📖' : ''}`).join('\n')
      : '*None*';

  const formatBulletCompact = (list) =>
    list.length > 0
      ? list.map((u) => `• ${formatParticipantLabel(u)}`).join('\n')
      : '*None*';

  const formatFillersCompact = (list) =>
    list.length > 0
      ? list
          .map((u, i) => `${i + 1}. ${formatParticipantLabel(u)}${u.moved_from_accepted ? ' (moved)' : ''}`)
          .join('\n')
      : '*None*';

  let acceptedField = formatNumberedCompact(accepted);
  if (waitlist.length > 0) {
    acceptedField += `\n**Waitlist (${waitlist.length}):**\n${waitlist
      .map((u, i) => `${i + 1}. ${formatParticipantLabel(u)}${u.is_sherpa ? ' 📖' : ''}`)
      .join('\n')}`;
  }

  const embedColor = parseHexColor(event.color_hex) ?? 0x5865f2;
  const effectiveImage = resolveEventImage(event.title, event.image_url);

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(event.title)
    .setDescription(
      `${event.description}\n\n` +
      `📅 **When:** <t:${event.start_unix}:F> (<t:${event.start_unix}:R>)\n` +
      `👑 **Host:** <@${event.host_id}>\n` +
      `📚 **New to this activity?** Check out <#${GUIDES_CHANNEL_ID}> ([Open Link](${GUIDES_CHANNEL_URL}))`
    )
    .addFields(
      {
        name: `✅ Accepted [${capLabel}]`,
        value: acceptedField,
        inline: true,
      },
      {
        name: `📖 Sherpa [${sherpas.length}]`,
        value: formatBulletCompact(sherpas),
        inline: true,
      },
      {
        name: `🪑 Fillers [${fillers.length}]`,
        value: formatFillersCompact(fillers),
        inline: true,
      },
      {
        name: `🚫 Backed-out [${backedOut.length}]`,
        value: backedOut.length > 0 ? backedOut.map((u) => formatParticipantLabel(u)).join(', ') : '*None*',
        inline: false,
      }
    )
    .setFooter({ text: `Event ID: ${event.id}  •  Sherpas / @admin: Manage Attendees • Host / @admin: Edit or Delete` });

  if (effectiveImage) {
    embed.setImage(effectiveImage);
  }

  const signupRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`signup:${event.id}:accepted`)
      .setLabel('Accepted')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`signup:${event.id}:fillers`)
      .setLabel('Fillers')
      .setEmoji('🪑')
      .setStyle(ButtonStyle.Primary)
  );

  const manageRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`manage:${event.id}:attendees`)
      .setLabel('Manage Attendees')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`manage:${event.id}:edit`)
      .setLabel('Edit Event')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`manage:${event.id}:delete`)
      .setLabel('Delete Event')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
  );

  let content = undefined;
  let allowedMentions = undefined;

  if (includePublishPing && (event.tag_option === 'raids' || event.tag_option === 'dungeons')) {
    const role = findTagRole(guild, event.tag_option);
    const mentionText = role ? `<@&${role.id}>` : `@${event.tag_option}`;
    content = `📣 ${mentionText} — **${event.title}** is now open for signups!`;
    if (role) {
      allowedMentions = { roles: [role.id] };
    }
  }

  return { content, allowedMentions, embeds: [embed], components: [signupRow, manageRow] };
}

function buildCreateEventPromptPayload() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CREATE_EVENT_BUTTON_ID)
      .setLabel('Create Event')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success)
  );

  return {
    content: 'Want to host a run? Click below to create an event:',
    components: [row],
  };
}

async function refreshCreateEventPromptAtBottom(client, channelId, guild = null) {
  if (!channelId) return;

  if (!hasEventsInChannel(channelId)) {
    const existingPromptId = channelPromptMessages.get(channelId);
    if (existingPromptId) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const oldPrompt = await channel.messages.fetch(existingPromptId).catch(() => null);
        if (oldPrompt) await oldPrompt.delete().catch(() => {});
      }
      channelPromptMessages.delete(channelId);
    }
    return;
  }

  const channel =
    guild?.channels?.cache.get(channelId) ??
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased()) return;

  const existingPromptId = channelPromptMessages.get(channelId);
  if (existingPromptId) {
    const oldPrompt = await channel.messages.fetch(existingPromptId).catch(() => null);
    if (oldPrompt) await oldPrompt.delete().catch(() => {});
    channelPromptMessages.delete(channelId);
  }

  const promptMsg = await channel.send(buildCreateEventPromptPayload()).catch(() => null);
  if (promptMsg) {
    channelPromptMessages.set(channelId, promptMsg.id);
  }
}

// Descending order by start_unix: latest start time at top, soonest start time at bottom
async function reorderChannelEventsDescending(client, channelId, guild = null, publishEventId = null) {
  if (!channelId) return;

  const prevTask = channelSortQueues.get(channelId) ?? Promise.resolve();
  const nextTask = prevTask.catch(() => {}).then(async () => {
    const store = loadStore();
    const channelEvents = Object.values(store.events)
      .filter((ev) => ev.channel_id === channelId)
      .sort((a, b) => b.start_unix - a.start_unix || a.created_at - b.created_at);

    if (channelEvents.length === 0) {
      await refreshCreateEventPromptAtBottom(client, channelId, guild);
      return;
    }

    const channel =
      guild?.channels?.cache.get(channelId) ??
      (await client.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return;

    const resolvedGuild = guild ?? channel.guild ?? null;

    for (const ev of channelEvents) {
      if (ev.message_id) {
        const oldMsg = await channel.messages.fetch(ev.message_id).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }
    }

    for (const ev of channelEvents) {
      const shouldIncludePing = Boolean(publishEventId && ev.id === publishEventId);
      const payload = buildEventPayload(ev.id, shouldIncludePing, resolvedGuild);
      if (!payload) continue;

      const newMsg = await channel.send(payload).catch(() => null);
      if (newMsg) {
        setEventMessageAndThread(ev.id, newMsg.id, undefined);
      }
    }

    await refreshCreateEventPromptAtBottom(client, channelId, resolvedGuild);
  });

  channelSortQueues.set(channelId, nextTask);
  await nextTask;
}

async function syncEventThread(client, eventId) {
  const data = getEventWithDetails(eventId);
  if (!data || !data.event.thread_id) return;

  const channel = await client.channels.fetch(data.event.channel_id).catch(() => null);
  const thread =
    channel?.threads?.cache.get(data.event.thread_id) ??
    (await client.channels.fetch(data.event.thread_id).catch(() => null));

  if (!thread || !thread.isThread()) return;

  const activeIds = new Set(
    data.signups
      .filter((s) => s.status === 'accepted' || s.status === 'fillers')
      .map((s) => s.user_id)
  );
  activeIds.add(data.event.host_id);

  for (const userId of activeIds) {
    await thread.members.add(userId).catch(() => {});
  }

  const threadMembers = await thread.members.fetch().catch(() => null);
  if (threadMembers) {
    for (const [memberId] of threadMembers) {
      if (memberId !== client.user.id && !activeIds.has(memberId)) {
        await thread.members.remove(memberId).catch(() => {});
      }
    }
  }
}

async function createThreadAndNotifyAt15Min(client, eventId) {
  const data = getEventWithDetails(eventId);
  if (!data) return;

  const { event, signups } = data;
  const channel = await client.channels.fetch(event.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const acceptedIds = signups.filter((s) => s.status === 'accepted').map((s) => s.user_id);
  const fillerIds = signups.filter((s) => s.status === 'fillers').map((s) => s.user_id);

  const notAtCapacity = event.accepted_cap > 0 && acceptedIds.length < event.accepted_cap;
  const taggedIds = notAtCapacity ? [...acceptedIds, ...fillerIds] : acceptedIds;
  const uniqueTaggedIds = [...new Set(taggedIds)];

  let thread = null;
  if (event.thread_id) {
    thread =
      channel.threads?.cache.get(event.thread_id) ??
      (await client.channels.fetch(event.thread_id).catch(() => null));
  }

  if (!thread && event.message_id && channel.type === ChannelType.GuildText) {
    const eventMsg = await channel.messages.fetch(event.message_id).catch(() => null);
    if (eventMsg) {
      thread = await eventMsg
        .startThread({
          name: `${event.title.slice(0, 80)} — 15m Lobby`,
          autoArchiveDuration: 1440,
        })
        .catch(() => null);
      if (thread) {
        setEventMessageAndThread(event.id, event.message_id, thread.id);
      }
    }
  }

  const memberIdsToAdd = new Set([event.host_id, ...uniqueTaggedIds]);
  if (thread && thread.isThread()) {
    for (const userId of memberIdsToAdd) {
      await thread.members.add(userId).catch(() => {});
    }
  }

  const mentions =
    uniqueTaggedIds.length > 0
      ? uniqueTaggedIds.map((id) => `<@${id}>`).join(' ')
      : 'No accepted signups yet.';

  const capacityNote = notAtCapacity
    ? '\n*(Event is below capacity — Fillers have been included!)*'
    : '';

  const messageBody =
    `⏰ **15-Minute Reminder:** **${event.title}** starts <t:${event.start_unix}:R> (<t:${event.start_unix}:t>)!${capacityNote}\n${mentions}`;

  if (thread && thread.isThread()) {
    await thread.send({ content: messageBody }).catch(() => {});
  } else {
    await channel.send({ content: messageBody }).catch(() => {});
  }
}

// ============================================================================
// 5. DISCORD CLIENT & INTERACTION HANDLERS
// ============================================================================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.on('error', (err) => {
  console.error('Discord client error:', err);
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || !message.channel?.isTextBased()) return;
  if (message.author.id === client.user.id) return;
  if (!hasEventsInChannel(message.channel.id)) return;

  await refreshCreateEventPromptAtBottom(client, message.channel.id, message.guild);
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  const store = loadStore();
  const activeChannelIds = new Set(
    Object.values(store.events)
      .map((ev) => ev.channel_id)
      .filter(Boolean)
  );
  for (const chId of activeChannelIds) {
    await reorderChannelEventsDescending(client, chId);
  }

  setInterval(async () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const dueEvents = getDueEvents(nowUnix);

    for (const ev of dueEvents) {
      markEventReminded(ev.id);
      await createThreadAndNotifyAt15Min(client, ev.id);
    }
  }, 30_000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // /event -> opens details modal
  if (interaction.isChatInputCommand() && interaction.commandName === 'event') {
    await interaction.showModal(buildEventDetailsModal());
    return;
  }

  // Quick "Create Event" button at bottom of channel -> opens details modal
  if (interaction.isButton() && interaction.customId === CREATE_EVENT_BUTTON_ID) {
    await interaction.showModal(buildEventDetailsModal());
    return;
  }

  // Modal submissions (create, draft edit, appearance/image, or live event edit)
  if (interaction.isModalSubmit() && interaction.customId.startsWith('event_modal:')) {
    const [, mode, targetId] = interaction.customId.split(':');

    if (mode === 'live_edit') {
      const data = getEventWithDetails(targetId);
      if (!data) {
        await interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (!canManageEvent(interaction, data.event)) {
        await interaction.reply({
          content: 'Only the **event host** or an **Admin** can edit this event.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const title = interaction.fields.getTextInputValue('title').trim();
      const whenRaw = interaction.fields.getTextInputValue('when').trim();
      const description =
        interaction.fields.getTextInputValue('description').trim() || 'Click a button below to RSVP.';
      const capRaw = interaction.fields.getTextInputValue('cap').trim();

      const startUnix = parseNaturalStartTime(whenRaw, DEFAULT_TIMEZONE);
      if (!startUnix) {
        await interaction.reply({
          content: `Could not understand **"${whenRaw}"**. Try phrases like \`Tomorrow at 6pm\`, \`Friday 8:30pm\`, or \`in 2 hours\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const acceptedCap = capRaw ? Math.max(0, Math.min(100, parseInt(capRaw, 10) || 0)) : 0;

      updatePublishedEvent(targetId, {
        title,
        when_raw: whenRaw,
        start_unix: startUnix,
        description,
        accepted_cap: acceptedCap,
      });

      await reorderChannelEventsDescending(client, data.event.channel_id, interaction.guild);

      await interaction.reply({ content: '✅ Event updated and reordered!', flags: MessageFlags.Ephemeral });
      return;
    }

    if (mode === 'appearance') {
      const draft = pendingDrafts.get(targetId);
      if (!draft || draft.hostId !== interaction.user.id) {
        await interaction.reply({ content: 'This draft expired.', flags: MessageFlags.Ephemeral });
        return;
      }

      const uploadedFiles = interaction.fields.getUploadedFiles?.('image_file');
      const uploadedAttachment = uploadedFiles?.first?.() ?? null;

      if (uploadedAttachment && !isImageAttachment(uploadedAttachment)) {
        await interaction.reply({
          content: 'Please upload a valid image file (PNG, JPG, GIF, or WebP).',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const rawImage = interaction.fields.getTextInputValue('image_url').trim();

      if (!uploadedAttachment && rawImage && !isValidImageUrl(rawImage)) {
        await interaction.reply({
          content: 'Please enter a valid `http://` or `https://` image URL, or upload an image file.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (uploadedAttachment?.url) {
        draft.imageUrl = uploadedAttachment.url;
      } else {
        draft.imageUrl = rawImage || null;
      }

      await interaction.update(buildDraftCustomizerPayload(draft.draftId, draft, interaction.guild));
      return;
    }

    // Create or Draft Edit Details modal
    const title = interaction.fields.getTextInputValue('title').trim();
    const whenRaw = interaction.fields.getTextInputValue('when').trim();
    const description =
      interaction.fields.getTextInputValue('description').trim() || 'Click a button below to RSVP.';
    const capRaw = interaction.fields.getTextInputValue('cap').trim();

    const existingDraft = mode === 'edit' ? pendingDrafts.get(targetId) : null;
    const timeZone = existingDraft?.timeZone ?? DEFAULT_TIMEZONE;

    const startUnix = parseNaturalStartTime(whenRaw, timeZone);
    if (!startUnix) {
      await interaction.reply({
        content: `Could not understand **"${whenRaw}"**. Try phrases like \`Tomorrow at 6pm\`, \`Friday 8:30pm\`, \`in 2 hours\`, or \`2026-11-25 20:00\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const acceptedCap = capRaw ? Math.max(0, Math.min(100, parseInt(capRaw, 10) || 0)) : 0;

    if (existingDraft && existingDraft.hostId === interaction.user.id) {
      existingDraft.title = title;
      existingDraft.whenRaw = whenRaw;
      existingDraft.startUnix = startUnix;
      existingDraft.description = description;
      existingDraft.acceptedCap = acceptedCap;

      await interaction.update(
        buildDraftCustomizerPayload(existingDraft.draftId, existingDraft, interaction.guild)
      );
      return;
    }

    const draftId = crypto.randomUUID().slice(0, 8);
    const draft = {
      draftId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      hostId: interaction.user.id,
      title,
      whenRaw,
      startUnix,
      timeZone,
      description,
      acceptedCap,
      tagOption: 'none',
      colorHex: '5865F2',
      imageUrl: null,
    };

    pendingDrafts.set(draftId, draft);
    await interaction.reply({
      ...buildDraftCustomizerPayload(draftId, draft, interaction.guild),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Attendee Manager Select Menus (Slot choice & Server User picker)
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('attendees:')) {
    const [, eventId, control] = interaction.customId.split(':');
    const data = getEventWithDetails(eventId);

    if (!data) {
      await interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!canManageAttendees(interaction, data.event)) {
      await interaction.reply({
        content: 'Only **Sherpas**, **Admins**, or the **event host** can manage attendees.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (control === 'slot') {
      const chosenSlot = interaction.values[0] === 'fillers' ? 'fillers' : 'accepted';
      pendingAttendeeAdds.set(`${eventId}:${interaction.user.id}`, chosenSlot);
      await interaction.update(buildAttendeeManagerPayload(eventId, data.event.title, chosenSlot));
    }
    return;
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('attendees:')) {
    const [, eventId, control] = interaction.customId.split(':');
    if (control !== 'add_user') return;

    const data = getEventWithDetails(eventId);
    if (!data) {
      await interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!canManageAttendees(interaction, data.event)) {
      await interaction.reply({
        content: 'Only **Sherpas**, **Admins**, or the **event host** can manage attendees.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetUserId = interaction.values[0];
    const targetMember =
      interaction.guild?.members?.cache.get(targetUserId) ??
      (await interaction.guild?.members?.fetch(targetUserId).catch(() => null));
    const targetUser = interaction.users?.get(targetUserId) ?? targetMember?.user ?? null;
    const targetDisplayName = getActorDisplayName(targetMember, targetUser);
    const targetHasSherpaRole = memberHasSherpaRole(targetMember);

    const stateKey = `${eventId}:${interaction.user.id}`;
    const selectedSlot = pendingAttendeeAdds.get(stateKey) ?? 'accepted';

    const res = adminAddUserToSlot(
      eventId,
      targetUserId,
      selectedSlot,
      targetHasSherpaRole,
      targetDisplayName
    );
    if (!res.ok) {
      await interaction.reply({ content: res.message, flags: MessageFlags.Ephemeral });
      return;
    }

    const updatedPayload = buildEventPayload(eventId, false, interaction.guild);
    const channel = await client.channels.fetch(data.event.channel_id).catch(() => null);
    if (channel?.isTextBased() && data.event.message_id && updatedPayload) {
      const eventMsg = await channel.messages.fetch(data.event.message_id).catch(() => null);
      if (eventMsg) await eventMsg.edit(updatedPayload).catch(() => {});
    }

    await syncEventThread(client, eventId);

    if (res.promotedUserId) {
      const promotedUser = await client.users.fetch(res.promotedUserId).catch(() => null);
      if (promotedUser) {
        await promotedUser
          .send(`🎉 A spot opened up! You've been **promoted from the waitlist** into **Accepted** for **${data.event.title}**.`)
          .catch(() => {});
      }
    }

    const refreshed = buildAttendeeManagerPayload(eventId, data.event.title, selectedSlot);
    await interaction.update({
      ...refreshed,
      content: `${res.message}\n\n${refreshed.content}`,
    });
    return;
  }

  // Draft Select Menus (Color Preset, Publish Tag)
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('draft:')) {
    const [, draftId, control] = interaction.customId.split(':');
    const draft = pendingDrafts.get(draftId);

    if (!draft || draft.hostId !== interaction.user.id) {
      await interaction.reply({
        content: 'This draft expired or belongs to another user.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (control === 'color_preset') {
      draft.colorHex = interaction.values[0] ?? '5865F2';
      await interaction.update(buildDraftCustomizerPayload(draftId, draft, interaction.guild));
    } else if (control === 'tag_option') {
      draft.tagOption = interaction.values[0] ?? 'none';
      await interaction.update(buildDraftCustomizerPayload(draftId, draft, interaction.guild));
    }
    return;
  }

  // Draft Customizer Buttons
  if (interaction.isButton() && interaction.customId.startsWith('draft:')) {
    const [, draftId, action] = interaction.customId.split(':');
    const draft = pendingDrafts.get(draftId);

    if (!draft || draft.hostId !== interaction.user.id) {
      await interaction.reply({
        content: 'This draft expired or belongs to another user.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'edit_details') {
      await interaction.showModal(buildEventDetailsModal(draft));
      return;
    }

    if (action === 'appearance') {
      await interaction.showModal(buildAppearanceModal(draft));
      return;
    }

    if (action === 'cancel') {
      pendingDrafts.delete(draftId);
      await interaction.update({
        content: 'Draft cancelled.',
        embeds: [],
        components: [],
      });
      return;
    }

    if (action === 'publish') {
      pendingDrafts.delete(draftId);

      const channel = await client.channels.fetch(draft.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        await interaction.update({
          content: 'Could not post to that channel.',
          embeds: [],
          components: [],
        });
        return;
      }

      const eventId = crypto.randomUUID().slice(0, 8);
      createEvent({
        id: eventId,
        guild_id: draft.guildId,
        channel_id: draft.channelId,
        host_id: draft.hostId,
        title: draft.title,
        when_raw: draft.whenRaw,
        description: draft.description,
        start_unix: draft.startUnix,
        accepted_cap: draft.acceptedCap,
        tag_option: draft.tagOption,
        color_hex: draft.colorHex,
        image_url: draft.imageUrl,
        created_at: Math.floor(Date.now() / 1000),
      });

      await reorderChannelEventsDescending(client, draft.channelId, interaction.guild, eventId);

      await interaction.update({
        content: `✅ Published **${draft.title}**!`,
        embeds: [],
        components: [],
      });
      return;
    }
  }

  // Published Event Management Buttons (Manage Attendees — Sherpas/Admins/Host; Edit / Delete — Host or @admin only)
  if (interaction.isButton() && interaction.customId.startsWith('manage:')) {
    const [, eventId, action] = interaction.customId.split(':');
    const data = getEventWithDetails(eventId);

    if (!data) {
      await interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === 'attendees') {
      if (!canManageAttendees(interaction, data.event)) {
        await interaction.reply({
          content: 'Only **Sherpas**, **Admins**, or the **event host** can manage attendees.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const stateKey = `${eventId}:${interaction.user.id}`;
      const currentSlot = pendingAttendeeAdds.get(stateKey) ?? 'accepted';
      pendingAttendeeAdds.set(stateKey, currentSlot);

      await interaction.reply({
        ...buildAttendeeManagerPayload(eventId, data.event.title, currentSlot),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!canManageEvent(interaction, data.event)) {
      await interaction.reply({
        content: 'Only the **event host** or an **Admin** can edit or delete this event.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'edit') {
      await interaction.showModal(buildPublishedEditModal(data.event));
      return;
    }

    if (action === 'delete') {
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`manage:${eventId}:confirm_delete`)
          .setLabel('Yes, Delete Event')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`manage:${eventId}:cancel_delete`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `Are you sure you want to delete **${data.event.title}**? This will remove the event and any lobby thread.`,
        components: [confirmRow],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'cancel_delete') {
      await interaction.update({
        content: `Deletion cancelled — **${data.event.title}** was kept.`,
        components: [],
      });
      return;
    }

    if (action === 'confirm_delete') {
      const removed = deleteEventRecord(eventId);
      const channel = await client.channels.fetch(removed.channel_id).catch(() => null);

      if (removed.thread_id && channel) {
        const thread =
          channel.threads?.cache.get(removed.thread_id) ??
          (await client.channels.fetch(removed.thread_id).catch(() => null));
        if (thread?.isThread()) {
          await thread.delete('Event deleted').catch(() => {});
        }
      }

      if (removed.message_id && channel?.isTextBased()) {
        const eventMsg = await channel.messages.fetch(removed.message_id).catch(() => null);
        if (eventMsg) {
          await eventMsg.delete().catch(() => {});
        }
      }

      await refreshCreateEventPromptAtBottom(client, removed.channel_id, interaction.guild);

      await interaction.update({
        content: `🗑️ Deleted **${removed.title}**.`,
        components: [],
      });
      return;
    }
  }

  // /event-clear (Admin only)
  if (interaction.isChatInputCommand() && interaction.commandName === 'event-clear') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'Only an **Administrator** can run this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const eventId = interaction.options.getString('event_id', true).trim();
    const targetUser = interaction.options.getUser('user', true);

    const data = getEventWithDetails(eventId);
    if (!data) {
      await interaction.reply({
        content: `No event found with ID \`${eventId}\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const res = adminRemoveUser(eventId, targetUser.id);
    if (!res.ok) {
      await interaction.reply({ content: res.message, flags: MessageFlags.Ephemeral });
      return;
    }

    const updatedPayload = buildEventPayload(eventId, false, interaction.guild);
    const channel = await client.channels.fetch(data.event.channel_id).catch(() => null);
    if (channel?.isTextBased() && data.event.message_id && updatedPayload) {
      const eventMsg = await channel.messages.fetch(data.event.message_id).catch(() => null);
      if (eventMsg) await eventMsg.edit(updatedPayload).catch(() => {});
    }

    await syncEventThread(client, eventId);

    if (res.promotedUserId) {
      const promotedUser = await client.users.fetch(res.promotedUserId).catch(() => null);
      if (promotedUser) {
        await promotedUser
          .send(`🎉 A spot opened up! You've been **promoted from the waitlist** into **Accepted** for **${data.event.title}**.`)
          .catch(() => {});
      }
    }

    await interaction.reply({ content: res.message, flags: MessageFlags.Ephemeral });
    return;
  }

  // Signup buttons on published event
  if (interaction.isButton() && interaction.customId.startsWith('signup:')) {
    const [, eventId, action] = interaction.customId.split(':');
    const data = getEventWithDetails(eventId);

    if (!data) {
      await interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral });
      return;
    }

    const isSherpa = memberHasSherpaRole(interaction.member);
    const actorDisplayName = getActorDisplayName(interaction);
    const result = handleSignupAction(
      eventId,
      action,
      interaction.user.id,
      isSherpa,
      actorDisplayName
    );

    if (!result.ok) {
      await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
      return;
    }

    // Keep any other participants' display names up to date if already cached in guild
    if (interaction.guild) {
      const freshData = getEventWithDetails(eventId);
      for (const s of freshData?.signups ?? []) {
        if (!s.display_name) {
          const cachedMember = interaction.guild.members.cache.get(s.user_id);
          const cachedName = getActorDisplayName(cachedMember, cachedMember?.user ?? null);
          if (cachedName) updateSignupDisplayName(eventId, s.user_id, cachedName);
        }
      }
    }

    const updatedPayload = buildEventPayload(eventId, false, interaction.guild);
    if (updatedPayload) {
      await interaction.update(updatedPayload);
    }

    await interaction
      .followUp({ content: result.message, flags: MessageFlags.Ephemeral })
      .catch(() => {});
    await syncEventThread(client, eventId);

    if (result.promotedUserId) {
      const promotedUser = await client.users.fetch(result.promotedUserId).catch(() => null);
      if (promotedUser) {
        await promotedUser
          .send(`🎉 A spot opened up! You've been **promoted from the waitlist** into **Accepted** for **${data.event.title}**.`)
          .catch(() => {});
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
