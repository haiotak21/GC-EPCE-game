/**
 * Amharic-first and English i18n dictionary for Game for power unity!
 * (የGC የካምፓስ ሚስጥር ፍለጋ)
 */

export type Language = 'am' | 'en';

export const translations = {
  am: {
    appTitle: 'የGC የካምፓስ ሚስጥር ፍለጋ',
    appSubtitle: 'የምረቃ ክፍል ተማሪዎች የቡድን ውድድር እና ትውስታ መፍጠሪያ',
    tagline: 'አራት ሚስጥሮች · ሶስት አሸናፊ ቡድኖች · 6,000 የኢትዮጵያ ብር ሽልማት',
    
    // Statuses
    status_DRAFT: 'ረቂቅ / ዝግጅት ላይ',
    status_REGISTRATION_OPEN: 'ምዝገባ ክፍት ነው',
    status_REGISTRATION_CLOSED: 'ምዝገባ ተዘግቷል (ቡድኖች እየተዘጋጁ ነው)',
    status_TEAMS_PUBLISHED: 'ቡድኖች ይፋ ተደርገዋል',
    status_IN_PROGRESS: 'ውድድሩ በይፋ ተጀምሯል!',
    status_PAUSED: 'ውድድሩ በጊዜያዊነት ቆሟል',
    status_FINISHED: 'ውድድሩ ተጠናቋል (ውጤት እየተጣራ ነው)',
    status_WINNERS_REVEALED: 'አሸናፊዎች ይፋ ተደርገዋል!',

    // Nav
    nav_home: 'መነሻ',
    nav_hints: 'ፍንጮች',
    nav_team: 'ቡድኔ',
    nav_alerts: 'መልዕክቶች',
    nav_checkpoint: 'ማረጋገጫ (QR)',
    nav_help: 'እርዳታ',
    nav_rules: 'ህጎች',
    nav_admin: 'አስተዳዳሪ',
    nav_winners: 'አሸናፊዎች',

    // Landing
    hero_title: 'የGC ካምፓስ ሚስጥር ፍለጋ',
    hero_desc: 'ከምረቃችን በፊት የማይረሳ የጋራ የካምፓስ ትውስታ እና ደስታ ለመፍጠር የተዘጋጀ የፍለጋ ውድድር። በስምዎ ይመዝገቡ፣ በዘፈቀደ የተመደቡ የ2-3 አባላት ቡድኖችን ይቀላቀሉ፣ ካምፓስ ውስጥ የተደበቁትን 4 ሚስጥሮች ይፍቱ!',
    register_cta: 'አሁኑኑ ይመዝገቡ',
    reg_closed_notice: 'ምዝገባ ተዘግቷል',
    how_it_works: 'ውድድሩ እንዴት ይሰራል?',
    prizes_title: 'የአሸናፊ ቡድኖች ሽልማት',
    prize_note: 'ማሳሰቢያ፡ የገንዘብ ሽልማቱ የጋራ ተነሳሽነት እንጂ ዋናው ዓላማችን የGC ትውስታ እና ፍቅር ማጠናከር ነው።',
    first_prize: '1ኛ ደረጃ',
    second_prize: '2ኛ ደረጃ',
    third_prize: '3ኛ ደረጃ',
    per_team: 'ለቡድኑ በሙሉ',
    organizers_label: 'በሶስት የክፍል አዘጋጆች የሚመራ',

    // Rules
    rules_title: 'የውድድሩ ህጎች እና መመሪያዎች',
    rule_teams: 'የቡድን አወቃቀር፡ እያንዳንዱ ቡድን ከ2 እስከ 3 አባላትን ያካተተ ሲሆን በአስተዳዳሪዎች በዘፈቀደ በፍትሃዊነት ይመደባል።',
    rule_safety: 'የካምፓስ ደህንነት፡ የተከለከሉ ህንጻዎች ውስጥ መግባት፣ መሮጥ ወይም ሌሎች ተማሪዎችን መረበሽ በጥብቅ የተከለከለ ነው።',
    rule_qr: 'የፍተሻ ጣቢያዎች፡ እያንዳንዱ ደረጃ ሲጠናቀቅ በቦታው የሚገኘው የQR ምልክት ወይም ኮድ መረጋገጥ አለበት።',
    rule_help: 'የእርዳታ ጥያቄ፡ እያንዳንዱ ቡድን የተወሰነ የፍንጭ እርዳታ ኮታ አለው፤ የደህንነት ጥያቄዎች ግን ያለገደብ ይስተናገዳሉ።',

    // Registration
    reg_title: 'ለሚስጥር ፍለጋው ይመዝገቡ',
    reg_name_label: 'ሙሉ ስምዎን ያስገቡ',
    reg_name_placeholder: 'ለምሳሌ፡ አበበ ከበደ ወርቁ',
    reg_consent: 'የውድድሩን ህጎች እና የካምፓስ ደህንነት መመሪያዎችን አንብቤ ተስማምቻለሁ',
    reg_privacy: 'ስልክ ቁጥር ወይም ኢሜይል አያስፈልግም። ምዝገባዎ በዚህ መሣሪያ ላይ በምስጢር ይቀመጣል።',
    reg_submit: 'ይመዝገቡ',

    // Waiting
    wait_title: 'ምዝገባዎ በተሳካ ሁኔታ ተጠናቋል!',
    wait_desc: 'አዘጋጆች የተሳታፊዎችን ዝርዝር በማጣራት ቡድኖችን እያዘጋጁ ነው። ቡድኖች ይፋ ሲደረጉ ይህ ገጽ ወዲያውኑ ይለወጣል።',
    wait_participant_no: 'የተሳታፊ መለያ ቁጥር',
    wait_recovery_title: 'የመልሶ ማግኛ ኮድ (Recovery Code)',
    wait_recovery_desc: 'ይህንን ኮድ ይቅዱ። ገጹ ቢዘጋ ወይም በሌላ ስልክ መግባት ቢፈልጉ ይጠቅምዎታል።',
    wait_status_card: 'የአዘጋጆች ቡድን ምደባ ገና ይፋ አልተደረገም',

    // Team reveal
    reveal_title: 'እንኳን ደስ አለዎት! ቡድንዎ ይፋ ሆነ',
    reveal_open_envelope: 'ሚስጥራዊውን ፖስታ ይክፈቱ',
    reveal_group_label: 'ቡድን',
    reveal_teammates: 'የቡድንዎ አባላት',
    reveal_cta: 'ቡድኔን አሳይ',
    reveal_skip: 'እለፍ',

    // Dashboard
    dash_welcome: 'እንኳን ደህና መጡ',
    dash_stage: 'ደረጃ',
    dash_current_clue: 'የአሁኑ ፍንጭ',
    dash_scan_btn: 'የQR ፍተሻ / ኮድ አስገባ',
    dash_help_btn: 'እርዳታ ጠይቅ',
    dash_progress: 'የቡድንዎ የ4ቱ ደረጃዎች ሂደት',

    // Hints
    hints_title: 'የፍንጭ የጊዜ ሰሌዳ',
    hint_stage_locked: 'ይህ ደረጃ ገና አልተለቀቀም',
    hint_stage_completed: 'ተጠናቋል ✓',
    hint_stage_current: 'የአሁኑ ንቁ ፍንጭ',
    hint_view: 'ዝርዝሩን አንብብ',
    hint_audio_listen: 'የድምፅ ፍንጭ አዳምጥ',
    hint_transcript: 'የድምፅ ጽሑፍ (Transcript)',
    hint_cipher: 'የተመሰጠረ ሚስጥር ኮድ',

    // Checkpoint
    check_title: 'የደረጃ ማረጋገጫ (Checkpoint)',
    check_scan_desc: 'በቦታው የሚገኘውን QR ኮድ በካሜራ ይቃኙ ወይም ባለ 4-ፊደል አጭር ኮዱን ያስገቡ።',
    check_manual_label: 'አጭር ኮድ (Manual Short Code)',
    check_manual_placeholder: 'ለምሳሌ፡ GC-LIB-2026',
    check_verify_btn: 'አረጋግጥ',
    check_success: 'ደረጃው በተሳካ ሁኔታ ተረጋግጧል!',
    check_already: 'ይህ ደረጃ ቀደም ሲል በቡድንዎ ተረጋግጧል!',
    check_invalid: 'የተሳሳተ ኮድ ነው። እባክዎ እንደገና ይሞክሩ።',
    check_camera_error: 'የካሜራ ፈቃድ አልተገኘም። እባክዎ ከታች ያለውን አጭር ኮድ ይጠቀሙ።',

    // Help
    help_title: 'የቡድን እርዳታ መጠየቂያ',
    help_remaining: 'ቀሪ የፍንጭ እርዳታ ኮታ',
    help_category: 'የችግሩ ዓይነት',
    help_cat_stuck: 'ፍንጩ አልገባንም (Stuck on clue)',
    help_cat_qr: 'የQR ችግር (QR issue)',
    help_cat_accessibility: 'የተደራሽነት ችግር (Accessibility)',
    help_cat_safety: 'አስቸኳይ / ደህንነት (Safety - ያለኮታ)',
    help_msg_label: 'መልዕክትዎን ይጻፉ',
    help_msg_placeholder: 'ምን እያጋጠማችሁ ነው?...',
    help_send: 'ጥያቄውን ላክ',
    help_thread_title: 'የቡድኑ እና አዘጋጆች የውይይት ማህደር',

    // Winners
    win_title: 'የውድድሩ አሸናፊዎች!',
    win_pending_title: 'ውጤቱ በይፋ አልተገለጸም',
    win_pending_desc: 'አዘጋጆች የተጠናቀቁባቸውን ሰዓቶች እና ማረጋገጫዎች እየገመገሙ ነው። ውድድሩ ሲያበቃ አሸናፊዎቹ እዚህ ይፋ ይሆናሉ።',
    win_team_label: 'ቡድን',

    // Admin
    admin_title: 'የአዘጋጆች መቆጣጠሪያ ማዕከል',
    admin_login_title: 'የአዘጋጅ መግቢያ',
    admin_login_notice: 'ለ3ቱ የተፈቀደላቸው አዘጋጆች ብቻ',
    admin_cmd_center: 'ዋና ማዘዣ',
    admin_participants: 'ተሳታፊዎች',
    admin_groups: 'የቡድን ምደባ ስቱዲዮ',
    admin_hints: 'ፍንጮች እና ሚስጥሮች',
    admin_checkpoints: 'የQR ቼክፖይንቶች',
    admin_progress: 'የቀጥታ የቡድኖች ሂደት',
    admin_help_desk: 'የእርዳታ ዴስክ',
    admin_winners_console: 'የአሸናፊዎች ምርጫ',
    admin_settings: 'ቅንብሮች',
    admin_audit: 'የድርጊቶች ታሪክ',
  },
  en: {
    appTitle: 'Game for power unity!',
    appSubtitle: 'Graduating Class Campus Mystery Hunt & Memory Making',
    tagline: '4 Mystery Clues · 3 Winning Teams · 6,000 ETB Total Prize Pool',

    // Statuses
    status_DRAFT: 'Draft / Setup',
    status_REGISTRATION_OPEN: 'Registration Open',
    status_REGISTRATION_CLOSED: 'Registration Closed (Assigning Teams)',
    status_TEAMS_PUBLISHED: 'Teams Published',
    status_IN_PROGRESS: 'Hunt In Progress!',
    status_PAUSED: 'Hunt Temporarily Paused',
    status_FINISHED: 'Hunt Finished (Reviewing Results)',
    status_WINNERS_REVEALED: 'Winners Revealed!',

    // Nav
    nav_home: 'Home',
    nav_hints: 'Hints',
    nav_team: 'Team',
    nav_alerts: 'Alerts',
    nav_checkpoint: 'Verify (QR)',
    nav_help: 'Help',
    nav_rules: 'Rules',
    nav_admin: 'Admin',
    nav_winners: 'Winners',

    // Landing
    hero_title: 'Game for power unity!',
    hero_desc: 'A joyful mobile-first campus treasure hunt for our graduating class to celebrate shared memories, solve Ethiopian campus riddles, and discover secrets together.',
    register_cta: 'Register Now',
    reg_closed_notice: 'Registration Closed',
    how_it_works: 'How It Works',
    prizes_title: 'Team Prize Rewards',
    prize_note: 'Note: Prize money is a fun incentive, but the true prize is creating lasting GC memories with your classmates.',
    first_prize: '1st Place',
    second_prize: '2nd Place',
    third_prize: '3rd Place',
    per_team: 'Per Winning Team',
    organizers_label: 'Managed by 3 Class Organizers',

    // Rules
    rules_title: 'Rules & Fairness Guidelines',
    rule_teams: 'Team Limit: Exactly 2 to 3 members per team, randomly and fairly shuffled by organizers before game start.',
    rule_safety: 'Campus Safety: No restricted building entry, no running through crowds, and respect all campus staff.',
    rule_qr: 'Checkpoints: Verify each stage at the physical campus spot via QR scan or short code.',
    rule_help: 'Assistance: Each team has a strict hint quota, while safety and accessibility issues are unlimited.',

    // Registration
    reg_title: 'Join the Mystery Hunt',
    reg_name_label: 'Your Full Name',
    reg_name_placeholder: 'e.g., Abebe Kebede Worku',
    reg_consent: 'I agree to the game rules, fair play, and campus safety policy',
    reg_privacy: 'No phone or email required. Your session is securely stored on this browser.',
    reg_submit: 'Complete Registration',

    // Waiting
    wait_title: 'Registration Confirmed!',
    wait_desc: 'Organizers are reviewing participants and preparing fair randomized teams. This page will update automatically when teams are published.',
    wait_participant_no: 'Participant ID',
    wait_recovery_title: 'Session Recovery Code',
    wait_recovery_desc: 'Save this code. You can use it to restore your participant session on another device.',
    wait_status_card: 'Organizers have not published teams yet',

    // Team reveal
    reveal_title: 'Team Published! Meet Your Squad',
    reveal_open_envelope: 'Open Mystery Envelope',
    reveal_group_label: 'Group',
    reveal_teammates: 'Your Teammates',
    reveal_cta: 'Meet My Team',
    reveal_skip: 'Skip Animation',

    // Dashboard
    dash_welcome: 'Welcome',
    dash_stage: 'Stage',
    dash_current_clue: 'Current Clue',
    dash_scan_btn: 'Scan QR / Enter Code',
    dash_help_btn: 'Need Help',
    dash_progress: 'Your Team 4-Stage Journey',

    // Hints
    hints_title: 'Four-Stage Clue Timeline',
    hint_stage_locked: 'Stage Locked & Redacted',
    hint_stage_completed: 'Completed ✓',
    hint_stage_current: 'Active Stage',
    hint_view: 'View Clue Details',
    hint_audio_listen: 'Listen to Audio Clue',
    hint_transcript: 'Audio Transcript',
    hint_cipher: 'Coded Cipher',

    // Checkpoint
    check_title: 'Stage Checkpoint Verification',
    check_scan_desc: 'Scan the checkpoint QR sign at the location, or enter the short 4-segment code manually.',
    check_manual_label: 'Manual Short Code',
    check_manual_placeholder: 'e.g., GC-LIB-2026',
    check_verify_btn: 'Verify Checkpoint',
    check_success: 'Checkpoint verified successfully!',
    check_already: 'This stage has already been verified by your team!',
    check_invalid: 'Invalid or out-of-order checkpoint code. Please check your clue.',
    check_camera_error: 'Camera permission denied or camera unavailable. Use manual code below.',

    // Help
    help_title: 'Team Help Desk',
    help_remaining: 'Remaining Clue Hint Quota',
    help_category: 'Issue Category',
    help_cat_stuck: 'Stuck on clue',
    help_cat_qr: 'QR / Code issue',
    help_cat_accessibility: 'Accessibility barrier',
    help_cat_safety: 'Safety / Urgent (No quota deducted)',
    help_msg_label: 'Your Message',
    help_msg_placeholder: 'Describe what your team is facing...',
    help_send: 'Submit Request',
    help_thread_title: 'Team & Organizer Message Thread',

    // Winners
    win_title: 'Official Hunt Winners!',
    win_pending_title: 'Results Not Published Yet',
    win_pending_desc: 'Organizers are verifying checkpoint timestamps and evidence. The official podium will appear here as soon as announced.',
    win_team_label: 'Team',

    // Admin
    admin_title: 'Organizer Command Center',
    admin_login_title: 'Organizer Sign-In',
    admin_login_notice: 'Restricted to the 3 designated event organizers',
    admin_cmd_center: 'Command Center',
    admin_participants: 'Participants',
    admin_groups: 'Assignment Studio',
    admin_hints: 'Clues & Stages',
    admin_checkpoints: 'QR Checkpoints',
    admin_progress: 'Live Team Progress',
    admin_help_desk: 'Help Desk',
    admin_winners_console: 'Winner Reveal Console',
    admin_settings: 'Settings & Safety',
    admin_audit: 'Audit Log',
  },
} as const;
