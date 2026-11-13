import {
  GameStatus,
  Participant,
  Group,
  ClueStage,
  Checkpoint,
  CheckpointAttempt,
  GroupStageProgress,
  HelpRequest,
  Notification,
  GameResult,
  AdminUser,
  AdminAuditLog,
  GameSettings,
} from '../types';

const STORAGE_KEY = 'gc_mystery_hunt_store_v1';

export interface HuntStore {
  gameStatus: GameStatus;
  settings: GameSettings;
  participants: Participant[];
  groups: Group[];
  previewGroups: { number: number; memberIds: string[] }[] | null;
  clues: ClueStage[];
  checkpoints: Checkpoint[];
  attempts: CheckpointAttempt[];
  progress: GroupStageProgress[];
  helpRequests: HelpRequest[];
  notifications: Notification[];
  result: GameResult;
  admins: AdminUser[];
  auditLogs: AdminAuditLog[];
}

// 3 Designated Admins as specified in PRD
export const DEFAULT_ADMINS: AdminUser[] = [
  {
    id: 'admin-1',
    email: 'organizer1@hunt.gc',
    displayName: 'Yohannes M. (Lead Organizer)',
    role: 'lead_organizer',
    active: true,
  },
  {
    id: 'admin-2',
    email: 'organizer2@hunt.gc',
    displayName: 'Selamawit T. (Clue Master)',
    role: 'clue_master',
    active: true,
  },
  {
    id: 'admin-3',
    email: 'organizer3@hunt.gc',
    displayName: 'Biruk K. (Safety & Logistics)',
    role: 'safety_marshal',
    active: true,
  },
];

// Pre-seeded participants representing Ethiopian graduating class
export const DEFAULT_PARTICIPANTS: Participant[] = [
  {
    id: 'p-1',
    authUserId: 'auth-abebe',
    displayName: 'Abebe Kebede',
    registeredAt: '2026-11-09T08:15:00Z',
    recoveryCode: 'REC-AB72-91',
    status: 'active',
    assignedGroupId: 'grp-1',
  },
  {
    id: 'p-2',
    authUserId: 'auth-bethlehem',
    displayName: 'Bethlehem Tadesse',
    registeredAt: '2026-11-09T08:18:00Z',
    recoveryCode: 'REC-BT44-12',
    status: 'active',
    assignedGroupId: 'grp-1',
  },
  {
    id: 'p-3',
    authUserId: 'auth-chala',
    displayName: 'Chala Bekele',
    registeredAt: '2026-11-09T08:22:00Z',
    recoveryCode: 'REC-CB98-33',
    status: 'active',
    assignedGroupId: 'grp-1',
  },
  {
    id: 'p-4',
    authUserId: 'auth-dawit',
    displayName: 'Dawit Haile',
    registeredAt: '2026-11-09T08:25:00Z',
    recoveryCode: 'REC-DH19-74',
    status: 'active',
    assignedGroupId: 'grp-2',
  },
  {
    id: 'p-5',
    authUserId: 'auth-eyerusalem',
    displayName: 'Eyerusalem Getachew',
    registeredAt: '2026-11-09T08:30:00Z',
    recoveryCode: 'REC-EG65-50',
    status: 'active',
    assignedGroupId: 'grp-2',
  },
  {
    id: 'p-6',
    authUserId: 'auth-fikadu',
    displayName: 'Fikadu Assefa',
    registeredAt: '2026-11-09T08:35:00Z',
    recoveryCode: 'REC-FA21-88',
    status: 'active',
    assignedGroupId: 'grp-3',
  },
  {
    id: 'p-7',
    authUserId: 'auth-genet',
    displayName: 'Genet Molla',
    registeredAt: '2026-11-09T08:40:00Z',
    recoveryCode: 'REC-GM83-09',
    status: 'active',
    assignedGroupId: 'grp-3',
  },
];

export const DEFAULT_GROUPS: Group[] = [
  {
    id: 'grp-1',
    gameId: 'game-2026',
    number: 1,
    teamName: 'Group 1',
    customNameSet: false,
    publishedAt: '2026-11-09T09:00:00Z',
    memberIds: ['p-1', 'p-2', 'p-3'],
    captainId: 'p-1',
  },
  {
    id: 'grp-2',
    gameId: 'game-2026',
    number: 2,
    teamName: 'Group 2',
    customNameSet: false,
    publishedAt: '2026-11-09T09:00:00Z',
    memberIds: ['p-4', 'p-5'],
    captainId: 'p-4',
  },
  {
    id: 'grp-3',
    gameId: 'game-2026',
    number: 3,
    teamName: 'Group 3',
    customNameSet: false,
    publishedAt: '2026-11-09T09:00:00Z',
    memberIds: ['p-6', 'p-7'],
    captainId: 'p-6',
  },
];

export const DEFAULT_CLUES: ClueStage[] = [
  {
    id: 'clue-1',
    stage: 1,
    titleAmharic: 'ደረጃ 1፡ የጥንቱ ቤተ-መጻሕፍት ሰዓት (Group 1 Path)',
    titleEnglish: 'Stage 1: The Heritage Library Clock Tower',
    locationPlaceholder: 'Heritage Library Clock Tower (North Yard)',
    bodyAmharic: 'የመጀመሪያው ሚስጥር በጸጥታው ቤተ-መጻሕፍት ጥላ ስር ተቀምጧል። ከፍ ብዬ ቆሜ የዓመታትን ፈተና አይቻለሁ፣ የሺህ ተማሪዎችን እንቅልፍ አልባ ሌሊት አስታውሳለሁ።',
    bodyEnglish: 'The first mystery rests beneath the ancient campus library. Standing tall above the halls, it watched sleepless exam nights and quiet study hours.',
    riddleAmharic: 'አራት ጎን አለኝ ግን እግር የለኝም፤ ሁለት እጆች አሉኝ ግን መዳፍ የለኝም። ፊቴ ሁሌም ወደ ካምፓስ ያያል፣ ድምፄም በየሰዓቱ ያስጠነቅቃል... ማን ነኝ?',
    riddleEnglish: 'I have four faces but no eyes; two hands that never rest. Every hour I echo over the quad... what am I?',
    codedCipher: 'CIPHER-71: L-I-B // T-O-W-E-R // 2026',
    mediaType: 'text',
    attachedPdfUrl: '/assets/aistudio/GC_Campus_Mystery_Hunt_Complete_PRD_Stitch_UI_e3946da7.pdf',
    attachmentName: 'Campus_Heritage_Map.pdf',
    status: 'published',
    releasedAt: '2026-11-09T09:05:00Z',
    targetType: 'all',
    organizerAddenda: ['Organizer Note: Verification QR sign is posted on the North exterior pillar.'],
  },
  {
    id: 'clue-grp2-s1',
    stage: 1,
    targetGroupId: 'grp-2',
    targetType: 'specific_groups',
    targetGroupIds: ['grp-2'],
    titleAmharic: 'ደረጃ 1፡ የምዕራብ ጥንታዊ ቅስት (Group 2 Tailored Clue)',
    titleEnglish: 'Stage 1: West Archive Cloister (Group 2 Path)',
    locationPlaceholder: 'West Archive Outer Gallery',
    bodyAmharic: 'ለቡድን 2 የተዘጋጀ ልዩ የመጀመሪያ ፍንጭ! ከቤተ-መጻሕፍቱ ምዕራባዊ ክንፍ ጥላ ስር የተሰወረውን የድንጋይ ቅስት ፈልጉ።',
    bodyEnglish: 'Group 2 custom route! Seek the carved stone archway under the western wing of the archives where campus records are preserved.',
    riddleAmharic: 'በጥላ ስር እቆማለሁ፣ በሺዎች የሚቆጠሩ የምርምር ወረቀቶች በስተኋላዬ አሉ...',
    riddleEnglish: 'I stand guarded by silent stone, with decades of academic lore resting just beyond my portal...',
    codedCipher: 'CIPHER-G2-01: W-E-S-T // A-R-C-H // 2026',
    mediaType: 'text',
    attachedPdfUrl: '/assets/aistudio/GC_Campus_Mystery_Hunt_Complete_PRD_Stitch_UI_e3946da7.pdf',
    attachmentName: 'Squad2_Sector_Brief.pdf',
    status: 'published',
    releasedAt: '2026-11-09T09:05:00Z',
  },
  {
    id: 'clue-grp3-s1',
    stage: 1,
    targetGroupId: 'grp-3',
    targetType: 'specific_groups',
    targetGroupIds: ['grp-3'],
    titleAmharic: 'ደረጃ 1፡ የሳይንስ አደባባይ መነበቢያ (Group 3 Tailored Clue)',
    titleEnglish: 'Stage 1: Science Court Sunken Garden (Group 3 Path)',
    locationPlaceholder: 'Science Court Sunken Steps',
    bodyAmharic: 'ለቡድን 3 የተዘጋጀ ልዩ የመጀመሪያ ፍንጭ! በሳይንስ ህንፃው ዝቅተኛ አደባባይ ላይ የተተከለውን የማንበቢያ ድንጋይ ተመልከቱ።',
    bodyEnglish: 'Group 3 custom route! Locate the sun dial steps at the lower amphitheater of the Science complex.',
    riddleAmharic: 'በፀሐይ ብርሃን ሰዓቱን እቆጥራለሁ፣ ጥላዬ የትምህርታችንን ጊዜ ያሳያል...',
    riddleEnglish: 'I count the hours only by the sun, casting shadows on the steps of discovery...',
    codedCipher: 'CIPHER-G3-01: S-C-I // S-T-E-P-S // 2026',
    mediaType: 'text',
    status: 'published',
    releasedAt: '2026-11-09T09:05:00Z',
  },
  {
    id: 'clue-2',
    stage: 2,
    titleAmharic: 'ደረጃ 2፡ የምህንድስና አደባባይ ጥላ ዛፍ',
    titleEnglish: 'Stage 2: The Engineering Quad Acacia',
    locationPlaceholder: 'Engineering Quad Central Canopy',
    bodyAmharic: 'ወደ ሁለተኛው ጣቢያ ስትሄዱ የካምፓሱን አረንጓዴ ልብ ፈልጉ። በንድፍና በቀመር መካከል የቆመው ታላቅ ጥላ ሚስጥራዊውን ምልክት ደብቆ ይዟል።',
    bodyEnglish: 'To reach the second checkpoint, seek the green heart of campus between the labs. Under the shaded branches lies the secret verification sign.',
    riddleAmharic: 'በፀሐይ ጊዜ ጥላ እሰጣለሁ፤ ቅጠሎቼ እንደ መጻሕፍት ገጾች ይርገፈገባሉ። ሥሬ በካምፓሱ አፈር ውስጥ ጠልቆ ገብቷል...',
    riddleEnglish: 'I shelter hundreds from the midday sun, leaves rustling like study notes. At my roots lies the next path...',
    codedCipher: 'CIPHER-89: E-N-G // Q-U-A-D // 7741',
    mediaType: 'text',
    status: 'published',
    releasedAt: '2026-11-09T09:30:00Z',
    targetType: 'all',
  },
  {
    id: 'clue-3',
    stage: 3,
    titleAmharic: 'ደረጃ 3፡ የተማሪዎች መዝናኛ የድምፅ ማስታወሻ',
    titleEnglish: 'Stage 3: Student Lounge Acoustic Arch',
    locationPlaceholder: 'Student Center Acoustic Pavilion',
    bodyAmharic: 'ይህ ደረጃ የሚደመጥ የድምፅ ፍንጭ ይዟል። የድምፅ ቅንብሩን አዳምጡና ከጓደኞቻችሁ ጋር ተወያዩበት። ሻይ ስትጠጡና ስትጨዋወቱ የምትሰበሰቡበትን ቦታ ያስታውሳል።',
    bodyEnglish: 'This stage features an audio clue. Listen to the campus acoustic chime and read the transcript to find the social gathering point.',
    riddleAmharic: 'የሳቅ፣ የሻይ እና የጓደኝነት ማዕከል፤ ፈተና ሲያልቅ ሁሉም ሰው የሚተነፍስበት የካምፓስ ጥግ...',
    riddleEnglish: 'The hub of laughter, tea, and warm memories. Where every stressful week melted into friendship...',
    codedCipher: 'CIPHER-93: S-T-U-D // U-N-I-O-N // 9310',
    mediaType: 'audio',
    attachedAudioUrl: 'synthesized_chime',
    transcriptAmharic: 'የድምፅ ማስታወሻ፡ "ሰላም ተማሪዎች! ከቤተ-መጻሕፍት እና ላብራቶሪ ውጭ በGC ዘመናችን በጣም የሳቅንበትና ያወራንበት ድምፅ የሚሰማው የት ነው? ወደ ተማሪዎች ማዕከል ቅስት ሂዱ..."',
    transcriptEnglish: 'Audio note: "Greetings hunters! Beyond the classrooms, where did our loudest laughter ring across the graduation year? Head to the Student Union arch..."',
    status: 'published',
    releasedAt: '2026-11-09T09:45:00Z',
    targetType: 'all',
  },
  {
    id: 'clue-4',
    stage: 4,
    titleAmharic: 'ደረጃ 4፡ ዋናው ስታዲየም የመጨረሻው ሳጥን',
    titleEnglish: 'Stage 4: Grand Stadium Finish Podium',
    locationPlaceholder: 'Main Stadium North Bleachers',
    bodyAmharic: 'የመጨረሻው ደረጃ! በምረቃው ቀን በሺዎች የሚቆጠሩ ቤተሰቦች እና ጓደኞች ጭብጨባ በሚሰማበት ታላቁ ስታዲየም ውስጥ ወርቃማው ሚስጥር ተቀምጧል።',
    bodyEnglish: 'The final destination! In the grand stadium where graduation roars echo under the blue sky, the ultimate chest awaits verification.',
    riddleAmharic: 'በሺዎች የሚቆጠሩ ቆቦች ወደ ሰማይ የሚወረወሩበት፣ የዓመታት ድካማችን የሚደምቅበት ቦታ...',
    riddleEnglish: 'Where thousands of graduation caps take flight into the sky, celebrating years of dedication...',
    codedCipher: 'CIPHER-FINAL: S-T-A-D-I-U-M // 5000',
    mediaType: 'riddle',
    status: 'published',
    releasedAt: '2026-11-09T10:00:00Z',
    targetType: 'all',
  },
];

export const DEFAULT_CHECKPOINTS: Checkpoint[] = [
  {
    id: 'chk-1',
    stage: 1,
    locationLabel: 'Heritage Library Clock Tower (North Base)',
    shortCode: 'GC-LIB-2026',
    qrCodeValue: 'HUNT-GC-STAGE-1-LIB-2026',
    status: 'active',
    isRotating: false,
    scanWindowMinutes: 90,
  },
  {
    id: 'chk-2',
    stage: 2,
    locationLabel: 'Engineering Quad Acacia Tree',
    shortCode: 'GC-ENG-7741',
    qrCodeValue: 'HUNT-GC-STAGE-2-ENG-7741',
    status: 'active',
    isRotating: false,
    scanWindowMinutes: 90,
  },
  {
    id: 'chk-3',
    stage: 3,
    locationLabel: 'Student Lounge Acoustic Pavilion',
    shortCode: 'GC-AUD-9310',
    qrCodeValue: 'HUNT-GC-STAGE-3-AUD-9310',
    status: 'active',
    isRotating: false,
    scanWindowMinutes: 90,
  },
  {
    id: 'chk-4',
    stage: 4,
    locationLabel: 'Campus Grand Stadium Podium',
    shortCode: 'GC-FIN-5000',
    qrCodeValue: 'HUNT-GC-STAGE-4-FIN-5000',
    status: 'active',
    isRotating: false,
    scanWindowMinutes: 90,
  },
];

export const DEFAULT_SETTINGS: GameSettings = {
  title: 'GC Campus Mystery Hunt 2026',
  firstPrizeEtb: 3000,
  secondPrizeEtb: 2000,
  thirdPrizeEtb: 1000,
  maxTeamSize: 3,
  maxHelpRequestsPerTeam: 3,
  prizeSharingRule: 'Prize money is evenly distributed among all registered team members upon verification.',
  tieBreakingRule: 'Earliest verified completion timestamp on server records determines ranking.',
  campusSafetyNotes: 'Never enter staff-only or closed construction areas. Strictly walking on paved corridors.',
  languageDefault: 'en',
};

export const DEFAULT_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-1',
    gameId: 'game-2026',
    titleAmharic: 'እንኳን ወደ GC ካምፓስ ሚስጥር ፍለጋ በሰላም መጣችሁ!',
    titleEnglish: 'Welcome to GC Campus Mystery Hunt!',
    bodyAmharic: 'ውድ የ2026 የምረቃ ክፍል ተማሪዎች፣ የዛሬው ውድድር የፍቅር እና የትውስታ መፍጠሪያ ነው። እባክዎ ደንቦችን ያክብሩ።',
    bodyEnglish: 'Dear graduating class of 2026, today is about celebrating our campus journey and making lifelong memories together!',
    type: 'announcement',
    priority: 'normal',
    targetType: 'all',
    createdAt: '2026-11-09T08:00:00Z',
    createdBy: 'Yohannes M.',
    readBy: [],
  },
  {
    id: 'notif-2',
    gameId: 'game-2026',
    titleAmharic: 'ደረጃ 1 በይፋ ተከፍቷል!',
    titleEnglish: 'Stage 1 Clue Released!',
    bodyAmharic: 'የመጀመሪያው ፍንጭ ወደ ፍንጮች ገጽ ተለጥፏል። ቡድናችሁን ሰብስባችሁ መፍትሄውን ፈልጉ!',
    bodyEnglish: 'The first clue is live in your hints timeline. Regroup with your squad and decipher the riddle!',
    type: 'hint',
    priority: 'urgent',
    targetType: 'all',
    createdAt: '2026-11-09T09:05:00Z',
    createdBy: 'Selamawit T.',
    readBy: [],
  },
];

export const DEFAULT_PROGRESS: GroupStageProgress[] = [
  {
    groupId: 'grp-1',
    stage: 1,
    verifiedAt: '2026-11-09T09:18:22Z',
    verifiedBy: 'manual_code',
  },
  {
    groupId: 'grp-1',
    stage: 2,
    verifiedAt: '2026-11-09T09:39:10Z',
    verifiedBy: 'qr_scan',
  },
  {
    groupId: 'grp-2',
    stage: 1,
    verifiedAt: '2026-11-09T09:21:40Z',
    verifiedBy: 'manual_code',
  },
];

export const DEFAULT_HELP_REQUESTS: HelpRequest[] = [
  {
    id: 'help-1',
    groupId: 'grp-1',
    participantId: 'p-1',
    participantName: 'Abebe Kebede',
    stage: 2,
    category: 'stuck',
    message: 'የዛፉን አቅጣጫ አላገኘነውም። ወደ ምህንድስና ቤተ-ሙከራ አቅራቢያ ነው ወይስ ወደ ወርክሾፑ?',
    status: 'answered',
    createdAt: '2026-11-09T09:32:00Z',
    replies: [
      {
        id: 'reply-1',
        senderId: 'admin-2',
        senderName: 'Selamawit T. (Clue Master)',
        isAdmin: true,
        body: 'በምህንድስና ወርክሾፕ ሳይሆን በማዕከላዊው አረንጓዴ ሳር ሜዳ ላይ የሚገኘውን ትልቅ ዛፍ ተመልከቱ።',
        sentAt: '2026-11-09T09:34:10Z',
      },
    ],
  },
];

export const DEFAULT_AUDIT_LOGS: AdminAuditLog[] = [
  {
    id: 'log-1',
    adminEmail: 'organizer1@hunt.gc',
    event: 'REGISTRATION_OPENED',
    target: 'Game-2026',
    beforeSummary: 'Status: DRAFT',
    afterSummary: 'Status: REGISTRATION_OPEN',
    timestamp: '2026-11-09T08:00:00Z',
  },
  {
    id: 'log-2',
    adminEmail: 'organizer1@hunt.gc',
    event: 'TEAMS_PUBLISHED',
    target: '3 Groups (7 Members)',
    beforeSummary: 'Unassigned: 7',
    afterSummary: 'Groups: 3, Assigned: 7',
    timestamp: '2026-11-09T09:00:00Z',
  },
];

export const DEFAULT_RESULT: GameResult = {
  id: 'res-2026',
  gameId: 'game-2026',
  status: 'draft',
  revision: 1,
  winners: [
    { rank: 1, groupId: 'grp-1', prizeEtb: 3000 },
    { rank: 2, groupId: 'grp-2', prizeEtb: 2000 },
    { rank: 3, groupId: 'grp-3', prizeEtb: 1000 },
  ],
  congratulationAmharic: 'ለሁሉም አሸናፊ እና ተሳታፊ የGC ተማሪዎች እንኳን ደስ አላችሁ! የማይረሳ ታሪክ ጻፍን!',
  congratulationEnglish: 'Heartfelt congratulations to all winning teams and participants! We made unforgettable memories!',
};

export function getInitialStore(): HuntStore {
  if (typeof window === 'undefined') {
    return {
      gameStatus: 'IN_PROGRESS',
      settings: DEFAULT_SETTINGS,
      participants: DEFAULT_PARTICIPANTS,
      groups: DEFAULT_GROUPS,
      previewGroups: null,
      clues: DEFAULT_CLUES,
      checkpoints: DEFAULT_CHECKPOINTS,
      attempts: [],
      progress: DEFAULT_PROGRESS,
      helpRequests: DEFAULT_HELP_REQUESTS,
      notifications: DEFAULT_NOTIFICATIONS,
      result: DEFAULT_RESULT,
      admins: DEFAULT_ADMINS,
      auditLogs: DEFAULT_AUDIT_LOGS,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to read from local storage:', e);
  }

  const initial: HuntStore = {
    gameStatus: 'IN_PROGRESS',
    settings: DEFAULT_SETTINGS,
    participants: DEFAULT_PARTICIPANTS,
    groups: DEFAULT_GROUPS,
    previewGroups: null,
    clues: DEFAULT_CLUES,
    checkpoints: DEFAULT_CHECKPOINTS,
    attempts: [],
    progress: DEFAULT_PROGRESS,
    helpRequests: DEFAULT_HELP_REQUESTS,
    notifications: DEFAULT_NOTIFICATIONS,
    result: DEFAULT_RESULT,
    admins: DEFAULT_ADMINS,
    auditLogs: DEFAULT_AUDIT_LOGS,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  } catch (e) {
    console.error('Failed to save initial store:', e);
  }

  return initial;
}

export function saveStore(store: HuntStore) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    // Broadcast change to other open windows/tabs
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('gc_mystery_hunt_channel');
      bc.postMessage({ type: 'STORE_UPDATED' });
      bc.close();
    }
  } catch (e) {
    console.error('Failed to save store:', e);
  }
}

/**
 * Deterministic Team Shuffling Algorithm conforming to Section 6.2 of PRD:
 * "For n >= 2, choose k = ceil(n/3), then distribute sizes of 2 and 3 when possible.
 * e.g., n=7 -> 3, 2, 2; n=8 -> 3, 3, 2; n=10 -> 3, 3, 2, 2. n=1 stays pending exception."
 */
export function calculateFairGroups(participantIds: string[]): {
  groups: { number: number; memberIds: string[] }[];
  pendingExceptions: string[];
} {
  const n = participantIds.length;
  if (n === 0) return { groups: [], pendingExceptions: [] };
  if (n === 1) {
    return {
      groups: [{ number: 1, memberIds: [participantIds[0]] }],
      pendingExceptions: [],
    };
  }

  // Shuffle copy
  const shuffled = [...participantIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const remainder = n % 3;
  const groups: { number: number; memberIds: string[] }[] = [];

  if (remainder === 0) {
    // Multiples of 3 (3, 6, 9...)
    for (let i = 0; i < n; i += 3) {
      groups.push({
        number: groups.length + 1,
        memberIds: shuffled.slice(i, i + 3),
      });
    }
  } else if (remainder === 2) {
    // 2 students left -> team of 2 (e.g. 5 -> 3, 2; 8 -> 3, 3, 2)
    const multiplesOf3 = n - 2;
    for (let i = 0; i < multiplesOf3; i += 3) {
      groups.push({
        number: groups.length + 1,
        memberIds: shuffled.slice(i, i + 3),
      });
    }
    groups.push({
      number: groups.length + 1,
      memberIds: shuffled.slice(multiplesOf3, n),
    });
  } else if (remainder === 1) {
    // 1 student left -> aligned into another team so they become 4 players
    if (n === 4) {
      groups.push({
        number: 1,
        memberIds: shuffled.slice(0, 4),
      });
    } else {
      // First team gets 4 players (3 + 1), others get 3 each
      groups.push({
        number: 1,
        memberIds: shuffled.slice(0, 4),
      });
      for (let i = 4; i < n; i += 3) {
        groups.push({
          number: groups.length + 1,
          memberIds: shuffled.slice(i, i + 3),
        });
      }
    }
  }

  return { groups, pendingExceptions: [] };
}

/**
 * Synthesizes an evocative campus chime audio clue using Web Audio API
 */
export function playMysteryAudioClue(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        resolve();
        return;
      }
      const ctx = new AudioCtx();
      const frequencies = [523.25, 659.25, 783.99, 1046.5, 880.0, 783.99]; // C5, E5, G5, C6, A5, G5
      const now = ctx.currentTime;

      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.4);

        gain.gain.setValueAtTime(0, now + idx * 0.4);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.4 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.4 + 1.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.4);
        osc.stop(now + idx * 0.4 + 1.3);
      });

      setTimeout(() => {
        ctx.close();
        resolve();
      }, (frequencies.length * 0.4 + 1.4) * 1000);
    } catch (e) {
      console.warn('Audio play error:', e);
      resolve();
    }
  });
}

/**
 * Returns the customized clue for a squad's current stage, prioritizing group-specific clues
 */
export function getActiveClueForGroup(
  clues: ClueStage[],
  stage: number,
  groupId?: string
): ClueStage {
  if (groupId) {
    const specific = clues.find(
      (c) =>
        c.stage === stage &&
        (c.targetGroupId === groupId || c.targetGroupIds?.includes(groupId))
    );
    if (specific) return specific;
  }
  const general = clues.find(
    (c) => c.stage === stage && (!c.targetGroupId || c.targetType === 'all')
  );
  return general || clues.find((c) => c.stage === stage) || clues[0];
}
