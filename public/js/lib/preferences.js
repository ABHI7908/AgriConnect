const LANGUAGE_KEY = 'agriconnect-language';
const THEME_KEY = 'agriconnect-theme';
const LANGUAGES = ['en', 'te', 'hi'];

const messages = {
  te: {
    Menu: 'మెనూ', 'Log in / Sign up': 'లాగిన్ / నమోదు', Language: 'భాష', Theme: 'థీమ్',
    System: 'సిస్టమ్', Light: 'లైట్', Dark: 'డార్క్',
    'Create account to continue': 'కొనసాగించడానికి ఖాతా సృష్టించండి',
    'Find machines': 'యంత్రాలను కనుగొనండి', 'Yield calculator': 'పంట దిగుబడి లెక్కింపు', 'Land & Yield Calculator': 'భూమి మరియు దిగుబడి కాలిక్యులేటర్', 'Log in': 'లాగిన్',
    'My farm bookings': 'నా వ్యవసాయ బుకింగ్‌లు', 'Past bookings': 'గత బుకింగ్‌లు', Chats: 'చాట్‌లు', 'Crop calculator': 'పంట కాలిక్యులేటర్',
    'My farm': 'నా వ్యవసాయం', 'My business': 'నా వ్యాపారం', Marketplace: 'మార్కెట్‌ప్లేస్',
    'Admin panel': 'అడ్మిన్ ప్యానెల్', 'Log out': 'లాగ్ అవుట్', 'List your machines': 'మీ యంత్రాలను జాబితా చేయండి',
    Admin: 'అడ్మిన్', 'AgriConnect: machinery, drones and farm labour near your field.': 'AgriConnect: మీ పొలానికి సమీపంలోని యంత్రాలు, డ్రోన్లు మరియు వ్యవసాయ కార్మికులు.',
    'AgriConnect account': 'AgriConnect ఖాతా', 'Register with your details, then sign in with your mobile OTP or password.': 'మీ వివరాలతో నమోదు చేసుకుని, మొబైల్ OTP లేదా పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి.',
    'Farm services, closer to you': 'మీకు చేరువలో వ్యవసాయ సేవలు',
    'Make every farm decision with confidence.': 'ప్రతి వ్యవసాయ నిర్ణయాన్ని నమ్మకంగా తీసుకోండి.',
    'Find the right machine or farm crew nearby, plan your land, and estimate your crop yield—all in one place.': 'సమీపంలోని యంత్రాలు లేదా వ్యవసాయ బృందాన్ని కనుగొనండి, భూమిని కొలవండి, పంట దిగుబడిని అంచనా వేయండి—అన్నీ ఒకేచోట.',
    'Machinery & farm labour': 'వ్యవసాయ యంత్రాలు మరియు కార్మికులు',
    'Explore nearby listings and send booking requests directly.': 'సమీపంలోని జాబితాలను చూసి నేరుగా బుకింగ్ అభ్యర్థనలు పంపండి.',
    'Measure your land': 'మీ భూమిని కొలవండి',
    'Walk your boundary with GPS or mark it on a map.': 'GPSతో సరిహద్దు వెంట నడవండి లేదా మ్యాప్‌లో గుర్తించండి.',
    'Estimate crop yield': 'పంట దిగుబడిని అంచనా వేయండి',
    'Plan harvest quantities and expected income.': 'పంట పరిమాణం మరియు అంచనా ఆదాయాన్ని ప్రణాళిక చేయండి.',
    'Explore the marketplace': 'మార్కెట్‌ప్లేస్‌ను చూడండి',
    'Forgot password?': 'పాస్‌వర్డ్ మర్చిపోయారా?', 'Reset your password': 'మీ పాస్‌వర్డ్‌ను రీసెట్ చేయండి',
    'New password': 'కొత్త పాస్‌వర్డ్', 'Confirm new password': 'కొత్త పాస్‌వర్డ్‌ను నిర్ధారించండి',
    'Verify OTP and change password': 'OTP ధృవీకరించి పాస్‌వర్డ్ మార్చండి', 'Password changed': 'పాస్‌వర్డ్ మార్చబడింది',
    'Your password has been updated. Log in with your new password or use a mobile OTP.': 'మీ పాస్‌వర్డ్ నవీకరించబడింది. కొత్త పాస్‌వర్డ్ లేదా మొబైల్ OTPతో లాగిన్ అవ్వండి.',
    'Hide password': 'పాస్‌వర్డ్ దాచండి', 'Show password': 'పాస్‌వర్డ్ చూపించండి',
    'Account type': 'ఖాతా రకం', 'Sign in or register': 'లాగిన్ లేదా నమోదు', 'Create account': 'ఖాతా సృష్టించండి',
    'Sign-in method': 'లాగిన్ విధానం', 'Mobile OTP': 'మొబైల్ OTP', Password: 'పాస్‌వర్డ్',
    'Registered mobile number': 'నమోదు చేసిన మొబైల్ నంబర్', 'Email address': 'ఈమెయిల్ చిరునామా',
    'Mobile:': 'మొబైల్:', 'Email:': 'ఈమెయిల్:',
    'Create password': 'పాస్‌వర్డ్ సృష్టించండి', 'Confirm password': 'పాస్‌వర్డ్ నిర్ధారించండి',
    'Use at least 8 characters. You can also sign in with an OTP.': 'కనీసం 8 అక్షరాలు ఉపయోగించండి. OTPతో కూడా లాగిన్ చేయవచ్చు.',
    'Verify mobile and register': 'మొబైల్ ధృవీకరించి నమోదు చేయండి', 'Registration complete': 'నమోదు పూర్తయింది',
    'Your mobile number is verified. You can now log in with an OTP or your password.': 'మీ మొబైల్ నంబర్ ధృవీకరించబడింది. ఇప్పుడు OTP లేదా పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి.',
    'Go to login': 'లాగిన్‌కు వెళ్లండి', 'Verify and log in': 'ధృవీకరించి లాగిన్ అవ్వండి',
    'Log in with mobile and password': 'మొబైల్ మరియు పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి',
    'Enter the verification code sent to': 'పంపిన ధృవీకరణ కోడ్‌ను నమోదు చేయండి:',
    'Verify and register': 'ధృవీకరించి నమోదు చేయండి', 'Back to registration': 'నమోదుకు తిరిగి వెళ్లండి',
    'Log in or register': 'లాగిన్ అవ్వండి లేదా నమోదు చేసుకోండి',
    'Enter your mobile number. We send a one-time password (OTP). New numbers are registered automatically.': 'మీ మొబైల్ నంబర్ నమోదు చేయండి. మేము వన్-టైమ్ పాస్‌వర్డ్ (OTP) పంపుతాము. కొత్త నంబర్లు ఆటోమేటిక్‌గా నమోదు అవుతాయి.',
    'I am a farmer': 'నేను రైతును', 'I own machines / labour': 'నా వద్ద యంత్రాలు / కార్మికులు ఉన్నాయి',
    'Mobile number': 'మొబైల్ నంబర్', 'Send OTP': 'OTP పంపండి', 'One-time password': 'వన్-టైమ్ పాస్‌వర్డ్',
    'Verify and continue': 'ధృవీకరించి కొనసాగించండి', 'Resend OTP': 'OTP మళ్లీ పంపండి', Change: 'మార్చండి',
    'Tell us about you': 'మీ వివరాలు చెప్పండి', 'Your name': 'మీ పేరు', 'Business / farm name (optional)': 'వ్యాపారం / వ్యవసాయం పేరు (ఐచ్ఛికం)',
    'Village / town': 'గ్రామం / పట్టణం', District: 'జిల్లా', State: 'రాష్ట్రం', 'Where are your machines kept?': 'మీ యంత్రాలు ఎక్కడ ఉన్నాయి?',
    'Farmers nearby will find you by this location. Tap the map, drag the pin, or use GPS.': 'ఈ ప్రదేశం ద్వారా సమీప రైతులు మిమ్మల్ని కనుగొంటారు. మ్యాప్‌పై నొక్కండి, పిన్‌ను లాగండి లేదా GPS ఉపయోగించండి.',
    'Use my GPS': 'నా GPS ఉపయోగించండి', 'Save and continue': 'సేవ్ చేసి కొనసాగించండి',
    'Machines and farm labour, within reach of your field': 'మీ పొలానికి సమీపంలోని యంత్రాలు మరియు వ్యవసాయ కార్మికులు',
    'Search tractors, harvesters, drones and work crews listed by owners around you. Closest first, with prices up front.': 'మీ సమీపంలోని ట్రాక్టర్లు, హార్వెస్టర్లు, డ్రోన్లు మరియు కార్మిక బృందాలను వెతకండి. దగ్గరలో ఉన్నవి ముందుగా, ధరలతో సహా.',
    Machinery: 'యంత్రాలు', Labour: 'కార్మికులు', 'Type of machine': 'యంత్రం రకం', 'Type of work': 'పని రకం',
    'All work types': 'అన్ని పనులు', 'All machines': 'అన్ని యంత్రాలు', 'Distance from you': 'మీ నుంచి దూరం',
    'Within 10 km': '10 కి.మీ. పరిధిలో', 'Within 25 km': '25 కి.మీ. పరిధిలో',
    'Within 50 km': '50 కి.మీ. పరిధిలో', 'Within 100 km': '100 కి.మీ. పరిధిలో', 'Within 250 km': '250 కి.మీ. పరిధిలో',
    'Use my location': 'నా ప్రదేశాన్ని ఉపయోగించండి', Search: 'వెతకండి',
    'Tap “Use my location”, or tap the map to choose where your field is.': '“నా ప్రదేశాన్ని ఉపయోగించండి” నొక్కండి లేదా మీ పొలం ప్రదేశాన్ని ఎంచుకోవడానికి మ్యాప్‌పై నొక్కండి.',
    'With operator': 'ఆపరేటర్‌తో', 'Sort by': 'క్రమబద్ధీకరణ', 'Nearest first': 'దగ్గరలో ఉన్నవి ముందుగా',
    'Price: low to high': 'ధర: తక్కువ నుంచి ఎక్కువ', 'Price: high to low': 'ధర: ఎక్కువ నుంచి తక్కువ',
    Newest: 'కొత్తవి ముందుగా', 'Nearby machinery': 'సమీపంలోని యంత్రాలు', 'Nearby labour teams': 'సమీపంలోని కార్మిక బృందాలు',
    'Nothing found nearby': 'సమీపంలో ఏమీ కనబడలేదు', 'Try a larger distance, a different type, or move the blue dot to another spot.': 'దూర పరిధిని పెంచండి, వేరే రకాన్ని ఎంచుకోండి లేదా నీలి చుక్కను వేరే ప్రదేశానికి తరలించండి.',
    'View details': 'వివరాలు చూడండి', 'No photo': 'ఫోటో లేదు', 'No photos': 'ఫోటోలు లేవు',
    'Request this machine': 'ఈ యంత్రాన్ని అభ్యర్థించండి', 'Request this team': 'ఈ బృందాన్ని అభ్యర్థించండి',
    'Log in as a farmer to send a booking request.': 'బుకింగ్ అభ్యర్థన పంపడానికి రైతుగా లాగిన్ అవ్వండి.',
    'Farmer login': 'రైతు లాగిన్', 'Only farmer accounts can send booking requests.': 'రైతు ఖాతాల నుంచే బుకింగ్ అభ్యర్థనలు పంపవచ్చు.',
    From: 'నుంచి', To: 'వరకు', 'Land to work (acres)': 'పని చేయాల్సిన భూమి (ఎకరాలు)',
    'Where is the work?': 'పని ఎక్కడ ఉంది?', 'Note to the owner': 'యజమానికి సందేశం',
    'Note to the provider': 'సేవాదారుకు సందేశం', 'Send request': 'అభ్యర్థన పంపండి',
    'The owner’s phone number is shared with you once they accept.': 'యజమాని అంగీకరించిన తర్వాత వారి ఫోన్ నంబర్ మీకు కనిపిస్తుంది.',
    'The provider’s phone number is shared with you once they accept.': 'సేవాదారు అంగీకరించిన తర్వాత వారి ఫోన్ నంబర్ మీకు కనిపిస్తుంది.',
    'Request sent. You will see the answer in My farm.': 'అభ్యర్థన పంపబడింది. సమాధానం నా వ్యవసాయం పేజీలో కనిపిస్తుంది.',
    'Land measure and yield calculator': 'భూమి కొలత మరియు పంట దిగుబడి లెక్కింపు',
    'Measure your land': 'మీ భూమిని కొలవండి', 'Walk the boundary (GPS)': 'సరిహద్దు వెంట నడవండి (GPS)',
    'Draw on map': 'మ్యాప్‌పై గీయండి', 'Start GPS': 'GPS ప్రారంభించండి', 'Mark corner here': 'ఈ మూలను గుర్తించండి',
    'Undo last point': 'చివరి బిందువును వెనక్కి తీసుకోండి', Clear: 'తొలగించండి', 'Centre on me': 'నా ప్రదేశానికి మధ్యలో పెట్టండి',
    'Use this area in the calculator': 'ఈ విస్తీర్ణాన్ని లెక్కింపులో ఉపయోగించండి', 'Crop yield': 'పంట దిగుబడి',
    'Estimate my harvest': 'నా పంట దిగుబడిని అంచనా వేయండి', 'Check my actual yield': 'నా వాస్తవ దిగుబడిని చూడండి',
    Crop: 'పంట', 'Land size': 'భూమి విస్తీర్ణం', Acres: 'ఎకరాలు', Guntas: 'గుంటలు', Hectares: 'హెక్టార్లు',
    'Expected yield': 'అంచనా దిగుబడి', 'Weight of one bag': 'ఒక బస్తా బరువు', 'Selling price (INR per quintal)': 'అమ్మకం ధర (క్వింటాల్‌కు రూపాయలు)',
    optional: 'ఐచ్ఛికం', Result: 'ఫలితం', 'Save to my farm': 'నా వ్యవసాయంలో సేవ్ చేయండి',
    'Open calculator': 'లెక్కింపును తెరవండి', 'New calculation': 'కొత్త లెక్కింపు',
    'Requests made': 'చేసిన అభ్యర్థనలు', 'Jobs completed': 'పూర్తయిన పనులు', 'Providers used': 'ఉపయోగించిన సేవాదారులు',
    'Spent on completed jobs': 'పూర్తయిన పనుల ఖర్చు', 'No services used yet': 'ఇంకా సేవలు ఉపయోగించలేదు',
    'Once an owner accepts your request, they appear here with the services you used.': 'యజమాని మీ అభ్యర్థనను అంగీకరించిన తర్వాత, మీరు ఉపయోగించిన సేవలతో వారు ఇక్కడ కనిపిస్తారు.',
    Provider: 'సేవాదారు', 'Services used': 'ఉపయోగించిన సేవలు', Jobs: 'పనులు', Completed: 'పూర్తయ్యాయి', Paid: 'చెల్లించినది', 'Last used': 'చివరిగా ఉపయోగించినది',
    'No saved calculations': 'సేవ్ చేసిన లెక్కలు లేవు', 'My details': 'నా వివరాలు',
    'New requests': 'కొత్త అభ్యర్థనలు', Earned: 'ఆదాయం', 'No customers yet': 'ఇంకా కస్టమర్లు లేరు',
    'Farmers whose requests you accept appear here with the services you provided.': 'మీరు అంగీకరించిన రైతుల అభ్యర్థనలు మరియు మీరు అందించిన సేవలు ఇక్కడ కనిపిస్తాయి.',
    Customer: 'కస్టమర్', 'Services provided': 'అందించిన సేవలు', 'Last service': 'చివరి సేవ',
    'No machines listed': 'యంత్రాలు జాబితా చేయలేదు', 'Add your first machine': 'మీ మొదటి యంత్రాన్ని జోడించండి',
    'No labour teams listed': 'కార్మిక బృందాలు జాబితా చేయలేదు', 'Add your first labour team': 'మీ మొదటి కార్మిక బృందాన్ని జోడించండి',
    'Add machine': 'యంత్రాన్ని జోడించండి', 'Add labour team': 'కార్మిక బృందాన్ని జోడించండి',
    Requests: 'అభ్యర్థనలు', Machines: 'యంత్రాలు', Customers: 'కస్టమర్లు', Profile: 'ప్రొఫైల్',
    Bookings: 'బుకింగ్‌లు', History: 'చరిత్ర', Saved: 'సేవ్ చేసినవి',
    'Waiting for admin approval. Farmers cannot see it yet.': 'అడ్మిన్ ఆమోదం కోసం వేచి ఉంది. ఇంకా రైతులకు కనిపించదు.',
    'Waiting for admin approval.': 'అడ్మిన్ ఆమోదం కోసం వేచి ఉంది.',
    'Edit listing': 'జాబితాను సవరించండి', Save: 'సేవ్ చేయండి', Delete: 'తొలగించండి',
    'Please wait': 'దయచేసి వేచి ఉండండి', Cancel: 'రద్దు చేయండి', Confirm: 'నిర్ధారించండి',
    Language: 'భాష', Theme: 'రూపకల్పన', System: 'సిస్టమ్', Light: 'లైట్', Dark: 'డార్క్',
    'Find machines & labour': 'యంత్రాలు మరియు కార్మికులను కనుగొనండి', 'My requests': 'నా అభ్యర్థనలు',
    'Services used': 'ఉపయోగించిన సేవలు', 'Saved calculations': 'సేవ్ చేసిన లెక్కలు', 'Profile': 'ప్రొఫైల్',
    'Business details': 'వ్యాపార వివరాలు', 'Machine updated': 'యంత్ర వివరాలు నవీకరించబడ్డాయి',
    'Machine deleted': 'యంత్రం తొలగించబడింది', 'Add a machine': 'యంత్రాన్ని జోడించండి',
    'Add a labour team': 'కార్మిక బృందాన్ని జోడించండి', 'Edit labour team': 'కార్మిక బృందాన్ని సవరించండి',
    'Publish listing': 'జాబితాను ప్రచురించండి', Publish: 'ప్రచురించండి', Uploading: 'అప్‌లోడ్ అవుతోంది',
    'Price per day (INR)': 'రోజుకు ధర (రూపాయలు)', 'Price per hour (INR)': 'గంటకు ధర (రూపాయలు)',
    'Price per acre (INR)': 'ఎకరానికి ధర (రూపాయలు)', 'Add at least one price.': 'కనీసం ఒక ధరను నమోదు చేయండి.',
    'Operator / driver included': 'ఆపరేటర్ / డ్రైవర్‌తో', Description: 'వివరణ', Brand: 'బ్రాండ్',
    Model: 'మోడల్', Year: 'సంవత్సరం', Type: 'రకం', Name: 'పేరు', Title: 'శీర్షిక',
    'Service radius (km)': 'సేవా పరిధి (కి.మీ.)', 'Where is it kept?': 'ఇది ఎక్కడ ఉంది?',
    'People in team': 'బృందంలోని వ్యక్తులు', 'Wage per person per day (INR)': 'వ్యక్తికి రోజువారీ కూలి (రూపాయలు)',
    Details: 'వివరాలు', 'Base location': 'ప్రధాన ప్రదేశం', 'Available for booking': 'బుకింగ్‌కు అందుబాటులో ఉంది',
    Available: 'అందుబాటులో ఉంది', Preview: 'ముందస్తు వీక్షణ', Edit: 'సవరించండి', 'photos': 'ఫోటోలు',
    'No customers yet': 'ఇంకా కస్టమర్లు లేరు', 'Customers served': 'సేవలందించిన కస్టమర్లు',
    'Provided by': 'సేవ అందించినవారు', 'Requested by': 'అభ్యర్థించినవారు',
    'No bookings here yet': 'ఇక్కడ ఇంకా బుకింగ్‌లు లేవు', Accept: 'అంగీకరించండి', Decline: 'తిరస్కరించండి',
    'Start work': 'పని ప్రారంభించండి', 'Mark completed': 'పూర్తయినట్లు గుర్తించండి', 'Cancel request': 'అభ్యర్థన రద్దు చేయండి',
    'Rate this service': 'ఈ సేవకు రేటింగ్ ఇవ్వండి', 'Submit review': 'సమీక్ష పంపండి', 'Not now': 'ఇప్పుడు వద్దు',
    'Your rating': 'మీ రేటింగ్', 'Comment (optional)': 'వ్యాఖ్య (ఐచ్ఛికం)', 'Thank you for your review': 'మీ సమీక్షకు ధన్యవాదాలు',
    'Work location:': 'పని ప్రదేశం:', 'Requested': 'అభ్యర్థించారు', 'Final': 'చివరి మొత్తం',
    Estimate: 'అంచనా', 'Only farmer accounts can send booking requests.': 'రైతు ఖాతాల నుంచే బుకింగ్ అభ్యర్థనలు పంపవచ్చు.',
    'Booking requested': 'బుకింగ్ అభ్యర్థించారు', Accepted: 'అంగీకరించారు', Rejected: 'తిరస్కరించారు',
    'In progress': 'పురోగతిలో ఉంది', Completed: 'పూర్తయ్యింది', Cancelled: 'రద్దు చేయబడింది',
    'Nearby machinery': 'సమీపంలోని యంత్రాలు', 'Loading…': 'లోడ్ అవుతోంది…',
    Tractor: 'ట్రాక్టర్', Harvester: 'హార్వెస్టర్', 'Spraying / Survey Drone': 'పిచికారీ / సర్వే డ్రోన్',
    'Rotavator / Cultivator': 'రోటవేటర్ / కల్టివేటర్', 'Plough / Disc Harrow': 'నాగలి / డిస్క్ హారో',
    'Seed Drill / Planter': 'విత్తన డ్రిల్ / ప్లాంటర్', 'Paddy Transplanter': 'వరి నాటే యంత్రం',
    'Power Sprayer': 'పవర్ స్ప్రేయర్', Thresher: 'నూర్పిడి యంత్రం', Baler: 'బేలర్',
    'Water Pump / Sprinkler': 'నీటి పంపు / స్ప్రింక్లర్', 'JCB / Earth Mover': 'JCB / ఎర్త్ మూవర్',
    'Trolley / Transport': 'ట్రాలీ / రవాణా', 'Other Equipment': 'ఇతర పరికరాలు',
    'Sowing / Transplanting': 'విత్తడం / నాటడం', Weeding: 'కలుపు తీయడం', Harvesting: 'కోత',
    Spraying: 'పిచికారీ', 'Fruit / Cotton Picking': 'పండ్లు / పత్తి ఏరడం',
    'Loading / Unloading': 'లోడింగ్ / అన్‌లోడింగ్', 'Irrigation Work': 'నీటిపారుదల పని',
    'General Farm Work': 'సాధారణ వ్యవసాయ పని',
    'Paddy (Rice)': 'వరి (బియ్యం)', Wheat: 'గోధుమ', Maize: 'మొక్కజొన్న', 'Groundnut': 'వేరుశెనగ',
    'Use my GPS': 'నా GPS ఉపయోగించండి', 'Stop GPS': 'GPS ఆపండి', 'Accuracy': 'ఖచ్చితత్వం',
    'Set location': 'ప్రదేశాన్ని సెట్ చేయండి', 'for distance': 'దూరం కోసం',
    'With operator': 'ఆపరేటర్‌తో', 'No location set': 'ప్రదేశం సెట్ చేయలేదు',
    'photo': 'ఫోటో', 'photos': 'ఫోటోలు',
  },
  hi: {
    Menu: 'मेनू', 'Log in / Sign up': 'लॉग इन / साइन अप', Language: 'भाषा', Theme: 'थीम',
    System: 'सिस्टम', Light: 'लाइट', Dark: 'डार्क',
    'Create account to continue': 'जारी रखने के लिए खाता बनाएं',
    'Find machines': 'मशीनें खोजें', 'Yield calculator': 'फसल उपज कैलकुलेटर', 'Land & Yield Calculator': 'भूमि और उपज कैलकुलेटर', 'Log in': 'लॉग इन',
    'My farm bookings': 'मेरी खेती की बुकिंग', 'Past bookings': 'पिछली बुकिंग', Chats: 'चैट', 'Crop calculator': 'फसल कैलकुलेटर',
    'My farm': 'मेरा खेत', 'My business': 'मेरा व्यवसाय', Marketplace: 'बाज़ार',
    'Admin panel': 'एडमिन पैनल', 'Log out': 'लॉग आउट', 'List your machines': 'अपनी मशीनें सूचीबद्ध करें',
    Admin: 'एडमिन', 'AgriConnect: machinery, drones and farm labour near your field.': 'AgriConnect: आपके खेत के पास मशीनें, ड्रोन और कृषि श्रमिक।',
    'AgriConnect account': 'AgriConnect खाता', 'Register with your details, then sign in with your mobile OTP or password.': 'अपनी जानकारी से पंजीकरण करें, फिर मोबाइल OTP या पासवर्ड से लॉग इन करें।',
    'Farm services, closer to you': 'खेती की सेवाएँ, आपके पास',
    'Make every farm decision with confidence.': 'खेती का हर फैसला भरोसे के साथ लें।',
    'Find the right machine or farm crew nearby, plan your land, and estimate your crop yield—all in one place.': 'पास की मशीन या खेत-मज़दूर दल खोजें, अपनी ज़मीन मापें और फसल की उपज का अनुमान लगाएँ—सब एक ही जगह।',
    'Machinery & farm labour': 'मशीनें और खेत-मज़दूर',
    'Explore nearby listings and send booking requests directly.': 'पास की सूचियाँ देखें और सीधे बुकिंग अनुरोध भेजें।',
    'Measure your land': 'अपनी ज़मीन मापें',
    'Walk your boundary with GPS or mark it on a map.': 'GPS से खेत की सीमा पर चलें या नक्शे पर निशान लगाएँ।',
    'Estimate crop yield': 'फसल की उपज का अनुमान',
    'Plan harvest quantities and expected income.': 'फसल की मात्रा और संभावित आमदनी की योजना बनाएँ।',
    'Explore the marketplace': 'मार्केटप्लेस देखें',
    'Forgot password?': 'पासवर्ड भूल गए?', 'Reset your password': 'अपना पासवर्ड रीसेट करें',
    'New password': 'नया पासवर्ड', 'Confirm new password': 'नए पासवर्ड की पुष्टि करें',
    'Verify OTP and change password': 'OTP सत्यापित करें और पासवर्ड बदलें', 'Password changed': 'पासवर्ड बदल गया',
    'Your password has been updated. Log in with your new password or use a mobile OTP.': 'आपका पासवर्ड अपडेट हो गया है। नए पासवर्ड या मोबाइल OTP से लॉग इन करें।',
    'Hide password': 'पासवर्ड छिपाएँ', 'Show password': 'पासवर्ड दिखाएँ',
    'Account type': 'खाते का प्रकार', 'Sign in or register': 'लॉग इन या पंजीकरण', 'Create account': 'खाता बनाएँ',
    'Sign-in method': 'लॉग इन का तरीका', 'Mobile OTP': 'मोबाइल OTP', Password: 'पासवर्ड',
    'Registered mobile number': 'पंजीकृत मोबाइल नंबर', 'Email address': 'ईमेल पता',
    'Mobile:': 'मोबाइल:', 'Email:': 'ईमेल:',
    'Create password': 'पासवर्ड बनाएँ', 'Confirm password': 'पासवर्ड की पुष्टि करें',
    'Use at least 8 characters. You can also sign in with an OTP.': 'कम से कम 8 अक्षर रखें। आप OTP से भी लॉग इन कर सकते हैं।',
    'Verify mobile and register': 'मोबाइल सत्यापित करें और पंजीकरण करें', 'Registration complete': 'पंजीकरण पूरा हुआ',
    'Your mobile number is verified. You can now log in with an OTP or your password.': 'आपका मोबाइल नंबर सत्यापित है। अब OTP या पासवर्ड से लॉग इन करें।',
    'Go to login': 'लॉग इन पर जाएँ', 'Verify and log in': 'सत्यापित करें और लॉग इन करें',
    'Log in with mobile and password': 'मोबाइल और पासवर्ड से लॉग इन करें',
    'Enter the verification code sent to': 'भेजा गया सत्यापन कोड दर्ज करें:',
    'Verify and register': 'सत्यापित करें और पंजीकरण करें', 'Back to registration': 'पंजीकरण पर वापस जाएँ',
    'Log in or register': 'लॉग इन करें या पंजीकरण करें',
    'Enter your mobile number. We send a one-time password (OTP). New numbers are registered automatically.': 'अपना मोबाइल नंबर दर्ज करें। हम एक बार उपयोग होने वाला पासवर्ड (OTP) भेजेंगे। नए नंबर अपने आप पंजीकृत हो जाते हैं।',
    'I am a farmer': 'मैं किसान हूँ', 'I own machines / labour': 'मेरे पास मशीनें / श्रमिक हैं',
    'Mobile number': 'मोबाइल नंबर', 'Send OTP': 'OTP भेजें', 'One-time password': 'एक बार उपयोग होने वाला पासवर्ड',
    'Verify and continue': 'सत्यापित करें और आगे बढ़ें', 'Resend OTP': 'OTP फिर भेजें', Change: 'बदलें',
    'Tell us about you': 'अपने बारे में बताएं', 'Your name': 'आपका नाम', 'Business / farm name (optional)': 'व्यवसाय / खेत का नाम (वैकल्पिक)',
    'Village / town': 'गाँव / शहर', District: 'ज़िला', State: 'राज्य', 'Where are your machines kept?': 'आपकी मशीनें कहाँ रखी हैं?',
    'Farmers nearby will find you by this location. Tap the map, drag the pin, or use GPS.': 'आसपास के किसान इस स्थान से आपको खोज पाएँगे। नक्शे पर टैप करें, पिन खींचें या GPS का उपयोग करें।',
    'Use my GPS': 'मेरा GPS उपयोग करें', 'Save and continue': 'सहेजें और आगे बढ़ें',
    'Machines and farm labour, within reach of your field': 'आपके खेत के पास मशीनें और कृषि श्रमिक',
    'Search tractors, harvesters, drones and work crews listed by owners around you. Closest first, with prices up front.': 'अपने आसपास के ट्रैक्टर, हार्वेस्टर, ड्रोन और श्रमिक दल खोजें। सबसे पास वाले पहले, कीमतों के साथ।',
    Machinery: 'मशीनें', Labour: 'श्रमिक', 'Type of machine': 'मशीन का प्रकार', 'Type of work': 'काम का प्रकार',
    'All work types': 'सभी काम', 'All machines': 'सभी मशीनें', 'Distance from you': 'आपसे दूरी',
    'Within 10 km': '10 किमी के भीतर', 'Within 25 km': '25 किमी के भीतर',
    'Within 50 km': '50 किमी के भीतर', 'Within 100 km': '100 किमी के भीतर', 'Within 250 km': '250 किमी के भीतर',
    'Use my location': 'मेरी लोकेशन उपयोग करें', Search: 'खोजें',
    'Tap “Use my location”, or tap the map to choose where your field is.': '“मेरी लोकेशन उपयोग करें” दबाएँ या अपने खेत की जगह चुनने के लिए नक्शे पर टैप करें।',
    'With operator': 'ऑपरेटर सहित', 'Sort by': 'क्रमबद्ध करें', 'Nearest first': 'सबसे पास पहले',
    'Price: low to high': 'कीमत: कम से ज़्यादा', 'Price: high to low': 'कीमत: ज़्यादा से कम',
    Newest: 'नवीनतम पहले', 'Nearby machinery': 'आसपास की मशीनें', 'Nearby labour teams': 'आसपास के श्रमिक दल',
    'Nothing found nearby': 'आसपास कुछ नहीं मिला', 'Try a larger distance, a different type, or move the blue dot to another spot.': 'दूरी बढ़ाएँ, दूसरा प्रकार चुनें या नीले बिंदु को दूसरी जगह ले जाएँ।',
    'View details': 'विवरण देखें', 'No photo': 'फोटो नहीं', 'No photos': 'फोटो नहीं',
    'Request this machine': 'इस मशीन का अनुरोध करें', 'Request this team': 'इस दल का अनुरोध करें',
    'Log in as a farmer to send a booking request.': 'बुकिंग अनुरोध भेजने के लिए किसान के रूप में लॉग इन करें।',
    'Farmer login': 'किसान लॉग इन', 'Only farmer accounts can send booking requests.': 'केवल किसान खाते बुकिंग अनुरोध भेज सकते हैं।',
    From: 'से', To: 'तक', 'Land to work (acres)': 'काम की ज़मीन (एकड़)',
    'Where is the work?': 'काम कहाँ करना है?', 'Note to the owner': 'मालिक के लिए संदेश',
    'Note to the provider': 'सेवा प्रदाता के लिए संदेश', 'Send request': 'अनुरोध भेजें',
    'The owner’s phone number is shared with you once they accept.': 'मालिक के स्वीकार करने पर उनका फोन नंबर आपको दिखेगा।',
    'The provider’s phone number is shared with you once they accept.': 'सेवा प्रदाता के स्वीकार करने पर उनका फोन नंबर आपको दिखेगा।',
    'Request sent. You will see the answer in My farm.': 'अनुरोध भेज दिया गया। जवाब मेरा खेत में दिखेगा।',
    'Land measure and yield calculator': 'ज़मीन माप और फसल उपज कैलकुलेटर',
    'Measure your land': 'अपनी ज़मीन मापें', 'Walk the boundary (GPS)': 'सीमा पर चलें (GPS)',
    'Draw on map': 'नक्शे पर बनाएँ', 'Start GPS': 'GPS शुरू करें', 'Mark corner here': 'यहाँ कोना चिह्नित करें',
    'Undo last point': 'पिछला बिंदु हटाएँ', Clear: 'मिटाएँ', 'Centre on me': 'मेरी लोकेशन पर केंद्रित करें',
    'Use this area in the calculator': 'इस क्षेत्र को कैलकुलेटर में उपयोग करें', 'Crop yield': 'फसल उपज',
    'Estimate my harvest': 'मेरी फसल का अनुमान लगाएँ', 'Check my actual yield': 'मेरी वास्तविक उपज देखें',
    Crop: 'फसल', 'Land size': 'ज़मीन का आकार', Acres: 'एकड़', Guntas: 'गुंटा', Hectares: 'हेक्टेयर',
    'Expected yield': 'अनुमानित उपज', 'Weight of one bag': 'एक बोरी का वज़न', 'Selling price (INR per quintal)': 'बिक्री मूल्य (प्रति क्विंटल रुपये)',
    optional: 'वैकल्पिक', Result: 'परिणाम', 'Save to my farm': 'मेरे खेत में सहेजें',
    'Open calculator': 'कैलकुलेटर खोलें', 'New calculation': 'नई गणना',
    'Requests made': 'किए गए अनुरोध', 'Jobs completed': 'पूरे हुए काम', 'Providers used': 'उपयोग किए सेवा प्रदाता',
    'Spent on completed jobs': 'पूरे हुए कामों पर खर्च', 'No services used yet': 'अभी तक कोई सेवा उपयोग नहीं की',
    'Once an owner accepts your request, they appear here with the services you used.': 'मालिक द्वारा आपका अनुरोध स्वीकार करने पर, उपयोग की गई सेवाओं के साथ वे यहाँ दिखेंगे।',
    Provider: 'सेवा प्रदाता', 'Services used': 'उपयोग की गई सेवाएँ', Jobs: 'काम', Completed: 'पूरे हुए', Paid: 'भुगतान', 'Last used': 'आखिरी बार उपयोग',
    'No saved calculations': 'कोई गणना सहेजी नहीं गई', 'My details': 'मेरी जानकारी',
    'New requests': 'नए अनुरोध', Earned: 'कमाई', 'No customers yet': 'अभी तक कोई ग्राहक नहीं',
    'Farmers whose requests you accept appear here with the services you provided.': 'जिन किसानों के अनुरोध आप स्वीकार करेंगे और दी गई सेवाएँ यहाँ दिखेंगी।',
    Customer: 'ग्राहक', 'Services provided': 'दी गई सेवाएँ', 'Last service': 'आखिरी सेवा',
    'No machines listed': 'कोई मशीन सूचीबद्ध नहीं', 'Add your first machine': 'अपनी पहली मशीन जोड़ें',
    'No labour teams listed': 'कोई श्रमिक दल सूचीबद्ध नहीं', 'Add your first labour team': 'अपना पहला श्रमिक दल जोड़ें',
    'Add machine': 'मशीन जोड़ें', 'Add labour team': 'श्रमिक दल जोड़ें',
    Requests: 'अनुरोध', Machines: 'मशीनें', Customers: 'ग्राहक', Profile: 'प्रोफ़ाइल',
    Bookings: 'बुकिंग', History: 'इतिहास', Saved: 'सहेजे गए',
    'Waiting for admin approval. Farmers cannot see it yet.': 'एडमिन की मंज़ूरी लंबित है। किसान इसे अभी नहीं देख सकते।',
    'Waiting for admin approval.': 'एडमिन की मंज़ूरी लंबित है।',
    'Edit listing': 'सूची संपादित करें', Save: 'सहेजें', Delete: 'हटाएँ',
    'Please wait': 'कृपया प्रतीक्षा करें', Cancel: 'रद्द करें', Confirm: 'पुष्टि करें',
    Language: 'भाषा', Theme: 'थीम', System: 'सिस्टम', Light: 'लाइट', Dark: 'डार्क',
    'Find machines & labour': 'मशीनें और श्रमिक खोजें', 'My requests': 'मेरे अनुरोध',
    'Services used': 'उपयोग की गई सेवाएँ', 'Saved calculations': 'सहेजी गई गणनाएँ', 'Profile': 'प्रोफ़ाइल',
    'Business details': 'व्यवसाय का विवरण', 'Machine updated': 'मशीन अपडेट की गई',
    'Machine deleted': 'मशीन हटाई गई', 'Add a machine': 'मशीन जोड़ें',
    'Add a labour team': 'श्रमिक दल जोड़ें', 'Edit labour team': 'श्रमिक दल संपादित करें',
    'Publish listing': 'सूची प्रकाशित करें', Publish: 'प्रकाशित करें', Uploading: 'अपलोड हो रहा है',
    'Price per day (INR)': 'प्रति दिन कीमत (रुपये)', 'Price per hour (INR)': 'प्रति घंटे कीमत (रुपये)',
    'Price per acre (INR)': 'प्रति एकड़ कीमत (रुपये)', 'Add at least one price.': 'कम से कम एक कीमत दर्ज करें।',
    'Operator / driver included': 'ऑपरेटर / ड्राइवर सहित', Description: 'विवरण', Brand: 'ब्रांड',
    Model: 'मॉडल', Year: 'वर्ष', Type: 'प्रकार', Name: 'नाम', Title: 'शीर्षक',
    'Service radius (km)': 'सेवा का दायरा (किमी)', 'Where is it kept?': 'यह कहाँ रखा है?',
    'People in team': 'दल में लोग', 'Wage per person per day (INR)': 'प्रति व्यक्ति दैनिक मज़दूरी (रुपये)',
    Details: 'विवरण', 'Base location': 'मुख्य स्थान', 'Available for booking': 'बुकिंग के लिए उपलब्ध',
    Available: 'उपलब्ध', Preview: 'पूर्वावलोकन', Edit: 'संपादित करें', 'photos': 'फोटो',
    'Customers served': 'सेवा प्राप्त ग्राहक', 'Provided by': 'सेवा प्रदाता', 'Requested by': 'अनुरोधकर्ता',
    'No bookings here yet': 'अभी तक कोई बुकिंग नहीं', Accept: 'स्वीकार करें', Decline: 'अस्वीकार करें',
    'Start work': 'काम शुरू करें', 'Mark completed': 'पूरा चिह्नित करें', 'Cancel request': 'अनुरोध रद्द करें',
    'Rate this service': 'इस सेवा को रेट करें', 'Submit review': 'समीक्षा भेजें', 'Not now': 'अभी नहीं',
    'Your rating': 'आपकी रेटिंग', 'Comment (optional)': 'टिप्पणी (वैकल्पिक)', 'Thank you for your review': 'समीक्षा के लिए धन्यवाद',
    'Work location:': 'काम का स्थान:', 'Requested': 'अनुरोध किया', 'Final': 'अंतिम',
    Estimate: 'अनुमान', 'Booking requested': 'बुकिंग का अनुरोध किया', Accepted: 'स्वीकार किया',
    Rejected: 'अस्वीकार किया', 'In progress': 'काम जारी है', Completed: 'पूरा हुआ', Cancelled: 'रद्द किया',
    'Loading…': 'लोड हो रहा है…',
    Tractor: 'ट्रैक्टर', Harvester: 'हार्वेस्टर', 'Spraying / Survey Drone': 'छिड़काव / सर्वे ड्रोन',
    'Rotavator / Cultivator': 'रोटावेटर / कल्टीवेटर', 'Plough / Disc Harrow': 'हल / डिस्क हैरो',
    'Seed Drill / Planter': 'सीड ड्रिल / प्लांटर', 'Paddy Transplanter': 'धान रोपाई मशीन',
    'Power Sprayer': 'पावर स्प्रेयर', Thresher: 'थ्रेशर', Baler: 'बेलर',
    'Water Pump / Sprinkler': 'वॉटर पंप / स्प्रिंकलर', 'JCB / Earth Mover': 'JCB / अर्थ मूवर',
    'Trolley / Transport': 'ट्रॉली / परिवहन', 'Other Equipment': 'अन्य उपकरण',
    'Sowing / Transplanting': 'बुवाई / रोपाई', Weeding: 'निराई', Harvesting: 'कटाई',
    Spraying: 'छिड़काव', 'Fruit / Cotton Picking': 'फल / कपास चुनना',
    'Loading / Unloading': 'लोडिंग / अनलोडिंग', 'Irrigation Work': 'सिंचाई का काम',
    'General Farm Work': 'सामान्य कृषि कार्य',
    'Paddy (Rice)': 'धान (चावल)', Wheat: 'गेहूँ', Maize: 'मक्का', Groundnut: 'मूँगफली',
    'Stop GPS': 'GPS रोकें', 'Accuracy': 'सटीकता', 'Set location': 'लोकेशन सेट करें',
    'for distance': 'दूरी के लिए', 'No location set': 'लोकेशन सेट नहीं',
    photo: 'फोटो', photos: 'फोटो',
  },
};

function stored(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

let language = stored(LANGUAGE_KEY, LANGUAGES, 'en');
let theme = stored(THEME_KEY, ['system', 'light', 'dark'], 'system');
const originals = new WeakMap();
let observer;

function translateText(node) {
  let entry = originals.get(node);
  if (!entry || node.nodeValue !== entry.rendered) {
    entry = { original: node.nodeValue, rendered: node.nodeValue };
    originals.set(node, entry);
  }
  const original = entry.original;
  const phrase = original.trim();
  if (!phrase) return;
  const translated = messages[language]?.[phrase];
  const rendered = translated ? original.replace(phrase, translated) : original;
  if (node.nodeValue !== rendered) node.nodeValue = rendered;
  entry.rendered = rendered;
}

function translateAttribute(element, name) {
  const originalName = `data-original-${name}`;
  if (!element.hasAttribute(originalName)) element.setAttribute(originalName, element.getAttribute(name) || '');
  const original = element.getAttribute(originalName);
  element.setAttribute(name, messages[language]?.[original] || original);
}

function translateElement(element) {
  if (!(element instanceof Element)) return;
  if (element.matches('input, textarea, script, style')) {
    ['placeholder', 'aria-label', 'title'].forEach((name) => {
      if (element.hasAttribute(name)) translateAttribute(element, name);
    });
    return;
  }
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) translateText(node);
    else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
  });
  ['aria-label', 'title'].forEach((name) => {
    if (element.hasAttribute(name)) translateAttribute(element, name);
  });
}

function applyLanguage() {
  language = stored(LANGUAGE_KEY, LANGUAGES, language);
  document.documentElement.lang = language;
  document.body?.setAttribute('lang', language);
  if (observer) observer.disconnect();
  translateElement(document.body);
  if (observer) observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  document.querySelectorAll('[data-language]').forEach((select) => { select.value = language; });
}

function resolvedTheme() {
  if (theme !== 'system') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  document.documentElement.style.colorScheme = resolvedTheme();
  document.querySelectorAll('[data-theme-choice]').forEach((select) => { select.value = theme; });
}

export function initPreferences(host, { language: includeLanguage = true, theme: includeTheme = true } = {}) {
  if (!observer && document.body) {
    observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'characterData') translateText(record.target);
        record.addedNodes?.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateText(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  applyLanguage();
  applyTheme();
  if (!host) return;

  let controls = host.querySelector('.preferences');
  if (!controls) {
    controls = document.createElement('span');
    controls.className = 'preferences';
    host.append(controls);
  }
  if (includeLanguage && !controls.querySelector('[data-language]')) {
    const control = document.createElement('span');
    control.className = 'preference-control';
    control.innerHTML = `
      <span class="preference-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path></svg></span>
      <label class="sr-only" for="app-language">Language</label>
      <select id="app-language" data-language aria-label="Language" title="Choose language">
        <option value="en">English</option><option value="te">తెలుగు</option><option value="hi">हिन्दी</option>
      </select>`;
    controls.append(control);
    control.querySelector('[data-language]').value = language;
    control.querySelector('[data-language]').addEventListener('change', (event) => {
      language = event.currentTarget.value;
      try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Preferences remain active for this page. */ }
      applyLanguage();
      document.dispatchEvent(new CustomEvent('agriconnect:languagechange', { detail: { language } }));
    });
  }
  if (includeTheme && !controls.querySelector('[data-theme-choice]')) {
    const control = document.createElement('span');
    control.className = 'preference-control';
    control.innerHTML = `
      <span class="preference-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path></svg></span>
      <label class="sr-only" for="app-theme">Theme</label>
      <select id="app-theme" data-theme-choice aria-label="Theme" title="Change appearance">
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>`;
    controls.append(control);
    control.querySelector('[data-theme-choice]').value = theme;
    control.querySelector('[data-theme-choice]').addEventListener('change', (event) => {
      theme = event.currentTarget.value;
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* Preferences remain active for this page. */ }
      applyTheme();
    });
  }
  applyLanguage();
}

window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (theme === 'system') applyTheme();
});
