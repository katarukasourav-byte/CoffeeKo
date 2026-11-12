/* =====================================================================
   SITE CONTENT — edit this file to change words, story stages, the quiz
   and labels. Save, and Netlify republishes the site in about a minute.

   Rules of thumb
   • Keep the quotes around text. To use an apostrophe inside 'single
     quotes', write it as ’ (curly) or switch the quotes to "double".
   • Keep the commas between items.
   • If the site goes blank after an edit, the last change has a typo:
     undo it in GitHub (History → revert) and try again.
   ===================================================================== */
window.SITE = {

  brand: 'CoffeeKo',
  /* What Google and browser tabs show. Not shown on the page itself. */
  pageTitle: 'CoffeeKo · Build your coffee personality',
  nav: { app: 'My coffee' },

  /* ---------- Opening screen ---------- */
  hero: {
    title: 'Every cup was once a seed.',
    sub: 'Scroll to follow one Arabica bean back to the soil, then forward again to your pour-over.',
    scrollLabel: 'Scroll',
    button: 'Build my coffee personality →',
    buttonNote: 'Free account · 1-minute quiz'
  },

  /* ---------- Scroll story ----------
     One entry per stage, in order. The first entry is the zooming bean.
     photo:   file name in the /photos folder (without .jpg)
     focus:   which part of the photo to keep on screen when cropped ('left% top%')
     title / text: the caption. Leave both out for no caption.
     credit / creditUrl: photographer credit shown in the corner.
     To add a stage, copy a block, change it, and put the photo in /photos. */
  story: [
    { photo: '01-roasted-bean', alt: 'A single roasted Arabica coffee bean, photographed close up',
      /* The zoom flies into this point. If you swap the bean photo, set its pixel
         size and the pixel position of the crease, and supply a close-up crop. */
      zoomInto: { photoWidth: 3983, photoHeight: 5233, x: 1700, y: 3250,
                  closeup: '01-roasted-bean-crease', closeupWidth: 1800, closeupHeight: 1200 },
      credit: 'blackieshoot', creditUrl: 'https://unsplash.com/photos/brown-seed-on-black-surface-vimMDduzk_k' },
    { photo: '02-green-beans', focus: '50% 50%', alt: 'Unroasted green coffee beans',
      title: 'Rewind the roast.',
      text: 'Before it was brown and fragrant, this bean was a pale green seed, one of two inside a ripe coffee cherry.',
      credit: 'wisnu dwi wibowo', creditUrl: 'https://unsplash.com/photos/a-pile-of-green-coffee-beans-sitting-on-top-of-a-table-tC0YW-s5QNk' },
    { photo: '03-seed-in-soil', focus: '50% 55%', alt: 'Coffee seedlings in a nursery, each lifting its seed on a thin stem',
      title: 'It starts in a nursery.',
      text: 'Seeds are planted in small bags of soil. After about two months each one pushes up on a thin stem, still wearing its seed like a helmet. Growers call this the soldier stage.',
      credit: 'Christian Joudrey', creditUrl: 'https://unsplash.com/photos/row-of-bean-sprout-aO_jMXTduUE' },
    { photo: '04-seedling', focus: '50% 45%', alt: 'Young coffee plants with their first leaves in nursery bags',
      title: 'First leaves.',
      text: 'The seed coat drops, two round leaves open, then the first true leaves. Seedlings stay in the nursery for six months to a year before they are planted out.',
      credit: 'Alejandro Pohlenz', creditUrl: 'https://unsplash.com/photos/green-leafed-plant-FLD08UzyVKY' },
    { photo: '05-young-plant', focus: '50% 55%', alt: 'Rows of coffee plants on a hillside with mountains behind',
      title: 'Leaf by leaf, row by row.',
      text: 'An Arabica plant needs three to four years before its first real harvest. It grows best on cool, high slopes.',
      credit: 'Projeto Café Gato-Mourisco', creditUrl: 'https://unsplash.com/photos/rows-of-coffee-plants-on-a-hillside-with-mountains-N_1lnzUYuAs' },
    { photo: '06-flowers', focus: '47% 42%', alt: 'A cluster of white coffee flowers',
      title: 'Two or three days of white.',
      text: 'The branches flower all at once, and the blossom smells faintly of jasmine.',
      credit: 'Alexandre Trouvé', creditUrl: 'https://unsplash.com/photos/white-flower-in-tilt-shift-lens-CS966deT-r0' },
    { photo: '07-green-cherries', focus: '50% 45%', alt: 'Coffee cherries ripening from green to orange to red',
      title: 'Then, the slow part.',
      text: 'Over seven to nine months the cherries swell and turn from green to yellow to red.',
      credit: 'Clint McKoy', creditUrl: 'https://unsplash.com/photos/round-green-and-red-berries-h28p96ICizo' },
    { photo: '08-red-cherries', focus: '55% 40%', alt: 'A cluster of ripe red and unripe green coffee cherries',
      title: 'Ripe means red.',
      text: 'A ripe cherry is sweet enough to eat. The sugar it builds up is part of the sweetness you taste in the cup.',
      credit: 'Andres Hernandez', creditUrl: 'https://unsplash.com/photos/red-and-green-cherry-fruit-fF9LOC5sMOQ' },
    { photo: '09-hand-picking', focus: '62% 45%', alt: 'A hand picking ripe red coffee cherries from the branch',
      title: 'Picked by hand.',
      text: 'For specialty lots, pickers return to the same plant several times a season and take only the ripe cherries.',
      credit: 'Carlos Felipe Ramírez Mesa', creditUrl: 'https://unsplash.com/photos/a-person-holding-a-bunch-of-berries-Ni7Cfu8AIMI' },
    { photo: '10-drying', focus: '45% 65%', alt: 'Coffee drying on a sunny patio, with filled sacks and mountains behind',
      title: 'Dried in the sun.',
      text: 'Natural process dries the whole cherry, which gives fruitier cups. Washed coffees have the fruit removed first and taste cleaner and brighter.',
      credit: 'Alexander Schimmeck', creditUrl: 'https://unsplash.com/photos/brown-wooden-stick-on-brown-sand-near-body-of-water-during-daytime-X-Yd4FIc0Wk' },
    { photo: '11-roasting', focus: '66% 60%', alt: 'Freshly roasted beans turning in a roaster’s cooling tray',
      title: 'Then, the roast.',
      text: 'Light roasts keep the fruit and acidity. Dark roasts trade them for body and a bittersweet depth. Where a coffee sits on this line shapes most of what you taste.',
      credit: 'Tim Mossholder', creditUrl: 'https://unsplash.com/photos/coffee-roasting-in-playa-del-carmen-YC6RVdoTtIk' },
    { photo: '12-pour-over', focus: '45% 55%', alt: 'Water poured from a gooseneck kettle into a pour-over dripper on a scale',
      title: 'And then, your cup.',
      text: 'Every coffee you try tells you something about your own taste. Start keeping track.',
      button: 'Build my coffee personality',
      credit: 'Andreas Behr', creditUrl: 'https://unsplash.com/photos/black-ceramic-mug-on-brown-wooden-table-qXLReVbjxvg' }
  ],

  /* ---------- Section headings ---------- */
  sections: {
    profile: { title: 'Coffee Personality', tab: 'Personality' },
    explore: { title: 'Explore', sub: 'Real coffees from specialty roasters, ranked by how well they match you. Every link opens the roaster’s own product page.', matchmaker: 'Open Match maker', search: 'Search any coffee, roaster or origin' },
    journal: { title: 'Journal – coffees tried earlier', tab: 'Journal', sub: 'Every coffee you’ve tried, and the ones waiting to be tried.' },
    shelf:   { title: 'Shelf',   sub: 'What’s at home, how fresh it is, and what to brew first.' }
  },

  /* ---------- Login screen ---------- */
  login: {
    title: 'Your coffee, remembered.',
    sub: 'Take a one-minute quiz, rate the coffees you drink, and get matched to real coffees from specialty roasters. Free.',
    /* What you can do here: shown next to the sign-up form so visitors see the features before signing up */
    features: [
      ['persona', 'Find your coffee personality', 'A one-minute quiz. Share it as an Instagram story card.'],
      ['match',   'Get matched to real coffees', 'Picks from your quiz, sharpened by every coffee you rate.'],
      ['journal', 'Rate what you drink', 'Snap the bag, rate the cup, see your coffees on a world map.'],
      ['shelf',   'Track your shelf', 'How much is left, when it’s at its best, one tap per brew.'],
      ['buy',     'Buy straight from roasters', 'Every coffee links to the roaster’s own shop.'] ],
    signupTitle: 'Build your coffee personality',
    signupButton: 'Create my account'
  },

  /* ---------- First-time setup: add past coffees ----------
     Shown right after the quiz the first time, and any time from
     “Add past coffees”. maxPhotos = how many photos in one go. */
  onboarding: {
    title: 'Add coffees you’ve had before',
    sub: 'Pick photos of the bags you’ve bought recently, several at once. We’ll identify each one and put them in a “To rate” list. Rate them now or whenever you like.',
    skip: 'Skip for now',
    skipToast: 'You can add past coffees any time from your Coffee Personality',
    maxPhotos: 20
  },

  /* ---------- Reminder to rate coffees waiting in “To rate” ---------- */
  reminders: {
    text: 'Every rating updates your Coffee Personality and your matches.',
    later: 'Remind me later',
    snoozeDays: 3
  },

  /* ---------- Taste quiz ----------
     key: what is stored (don’t change keys of existing questions).
     multi: true lets people pick several answers; max limits how many.
     options: [stored value, label, small hint]. */
  quiz: [
    { key: 'styles', multi: true, q: 'How do you usually have your coffee?', lead: 'Pick all that apply.', options: [
      ['pourover', 'Pour-over', 'V60, Chemex, AeroPress'], ['espresso', 'Espresso', 'Machine or moka pot'],
      ['frenchpress', 'French press', ''], ['filter', 'South Indian filter', 'Decoction, with or without chicory'],
      ['coldbrew', 'Cold brew', 'Steeped cold, or brew bags'], ['instant', 'Instant', 'Quick and easy'],
      ['cafe', 'Mostly at cafés', 'Lattes, cappuccinos'] ] },
    /* only when more than one style is picked: the options are the styles they picked */
    { key: 'main', from: 'styles', if: 'many:styles', q: 'Which do you have most often?', lead: 'We’ll lead with this, and still show the rest.' },
    /* one extra question for the main style */
    { key: 'form', if: 'main:brewer', q: 'Beans or ground coffee?', options: [
      ['beans', 'Whole beans', 'I grind at home'], ['ground', 'Ground coffee', 'Ready to brew'], ['either', 'Either', 'Happy with both'] ] },
    { key: 'chicory', if: 'main:filter', q: 'Chicory in your filter coffee?', options: [
      ['none', 'No chicory', 'Pure coffee'], ['some', 'A little', 'Up to about 20%'], ['classic', 'Classic blend', 'Around 30% or more'], ['unsure', 'Not sure', ''] ] },
    { key: 'cbserve', if: 'main:coldbrew', q: 'How do you have cold brew?', options: [
      ['black', 'Black over ice', 'Smooth and clean'], ['milk', 'With milk', 'Creamy, sometimes sweet'], ['concentrate', 'As a concentrate', 'Mixed into drinks'] ] },
    { key: 'strength', if: 'main:instant', q: 'How strong do you like it?', options: [
      ['mild', 'Mild', 'One small spoon'], ['regular', 'Regular', ''], ['strong', 'Strong', 'A heaped spoon or two'] ] },
    { key: 'milk', if: 'notmain:coldbrew', q: 'How do you take it?', options: [
      ['black', 'Black', 'No milk, no sugar'],
      ['milk', 'With milk', 'Milk or sugar, usually'],
      ['both', 'Either', 'Depends on the coffee'] ] },
    { key: 'flavours', multi: true, max: 4, q: 'Which flavours sound good?', lead: 'Pick up to four.', options: [
      ['chocolate', 'Chocolate', 'Cocoa, dark chocolate'], ['nutty', 'Nutty', 'Almond, hazelnut'],
      ['caramel', 'Caramel & sweet', 'Toffee, jaggery, honey'], ['fruity', 'Fruity & berry', 'Blueberry, plum, jam'],
      ['citrus', 'Citrus', 'Orange, lemon'], ['floral', 'Floral', 'Jasmine, tea-like'],
      ['spicy', 'Spicy', 'Cardamom, clove, pepper'], ['earthy', 'Earthy & woody', 'Tobacco, cedar, smoky'] ] },
    { key: 'roast', multi: true, q: 'Which roast sounds like you?', lead: 'Not sure? Medium is a good start.', options: [
      ['light', 'Light', 'Bright and fruity'], ['medium', 'Medium', 'Balanced and sweet'],
      ['medium-dark', 'Medium-dark', 'Chocolatey, fuller'], ['dark', 'Dark', 'Bold, smoky, bitter'] ] },
    { key: 'acidity', q: 'How do you feel about acidity?', lead: 'The tangy brightness some coffees have.', options: [
      [2, 'Keep it smooth', 'Low acid, mellow'], [3, 'A little brightness', 'Lively but gentle'], [4, 'Bright and juicy', 'Like fruit or wine'] ] },
    { key: 'body', q: 'How heavy should it feel?', options: [
      [2, 'Light', 'Clean, tea-like'], [3, 'Medium', 'Rounded'], [4, 'Rich and heavy', 'Syrupy, coats the mouth'] ] },
    { key: 'bitterness', q: 'And bitterness?', options: [
      [1, 'Avoid it', 'I don’t like bitter'], [2, 'A little is fine', 'As long as it’s balanced'], [4, 'I like it bold', 'Strong and punchy'] ] }
  ],

  /* ---------- Flavour families ----------
     label: shown on the radar and in filters.
     words: tasting-note words that count towards this family. */
  flavours: {
    fruity:    { label: 'Fruity & berry',  words: ['berry','berries','blueberry','strawberry','raspberry','cherry','fruit','jam','grape','plum','raisin','tropical','mango','pineapple','peach','apricot','apple','fig','date','wine','winey'] },
    citrus:    { label: 'Citrus',          words: ['citrus','orange','lemon','lime','grapefruit','bergamot','tangerine','mandarin'] },
    floral:    { label: 'Floral',          words: ['floral','jasmine','rose','hibiscus','lavender','tea','chamomile','blossom'] },
    chocolate: { label: 'Chocolate',       words: ['chocolate','cocoa','cacao','mocha','brownie'] },
    nutty:     { label: 'Nutty',           words: ['nut','nutty','almond','hazelnut','walnut','peanut','cashew','pecan'] },
    caramel:   { label: 'Caramel & sweet', words: ['caramel','toffee','honey','brown sugar','jaggery','molasses','maple','sugar','vanilla','butterscotch','sweet'] },
    spicy:     { label: 'Spicy',           words: ['spice','spicy','cinnamon','clove','cardamom','pepper','nutmeg','ginger'] },
    earthy:    { label: 'Earthy & woody',  words: ['earthy','woody','wood','tobacco','cedar','smoky','smoke','leather','malt','musty','herbal'] }
  },

  /* ---------- Coffee Personalities ----------
     The standard set. Everyone gets the one their ratings sit closest to,
     and it updates after every rating. 'look' is what this person tends to
     enjoy. 'shape' is the typical cup for the type (1–5 scales; roast 1 =
     light, 5 = dark; flavours = which tasting-note families stand out).
     You can rename or reword freely; change 'shape' only with care. */
  personalities: {
    newbie:    { name: 'The New Palate', text: 'Your personality appears after the quiz or your first rating, and sharpens with every coffee you rate.' },
    floral:    { name: 'The Floral Purist', text: 'Delicate, tea-like cups that smell of jasmine and bergamot.',
                 look: 'Light roasts, washed process, high-grown coffees',
                 shape: { roast: 1.6, acidity: 4.2, body: 2, sweetness: 3, bitterness: 1.2, flavours: { floral: 3, citrus: 2, fruity: 1 } } },
    fruity:    { name: 'The Fruit Hunter', text: 'Juicy, jammy cups that taste of berries, mango and stone fruit.',
                 look: 'Natural and anaerobic process, light to medium roasts',
                 shape: { roast: 2.3, acidity: 3.8, body: 3, sweetness: 4, bitterness: 1.5, flavours: { fruity: 3, citrus: 1, caramel: 1 } } },
    sweet:     { name: 'The Sweet Tooth', text: 'Round, sweet cups of caramel, jaggery and honey with just a little brightness.',
                 look: 'Honey process, medium roasts',
                 shape: { roast: 3, acidity: 2.8, body: 3.4, sweetness: 4.4, bitterness: 2, flavours: { caramel: 3, chocolate: 1, nutty: 1, fruity: 0.5 } } },
    balanced:  { name: 'The All-Rounder', text: 'Nothing too loud. You enjoy clean, balanced cups where no single flavour takes over.',
                 look: 'Medium roasts, washed coffees, classic estates',
                 shape: { roast: 3, acidity: 3, body: 3, sweetness: 3.2, bitterness: 2.2, flavours: { chocolate: 1, nutty: 1, caramel: 1, fruity: 1, citrus: 1 } } },
    chocolate: { name: 'The Chocolate Classicist', text: 'Cocoa, nuts and caramel with gentle acidity and a smooth, full body.',
                 look: 'Medium roasts from Chikmagalur and Coorg estates',
                 shape: { roast: 3.1, acidity: 2.4, body: 3.6, sweetness: 3.5, bitterness: 2.2, flavours: { chocolate: 3, nutty: 2, caramel: 1.5 } } },
    bold:      { name: 'The Bold Traditionalist', text: 'Heavy, low-acid cups with dark chocolate, spice and an earthy depth.',
                 look: 'Monsooned Malabar, medium-dark and dark roasts, South Indian filter',
                 shape: { roast: 4.2, acidity: 1.7, body: 4.4, sweetness: 2.8, bitterness: 3.2, flavours: { earthy: 2.5, spicy: 2, chocolate: 2 } } },
    explorer:  { name: 'The Explorer', text: 'You love coffees that are nothing alike, from bright and floral to dark and earthy. Variety is your thing.',
                 look: 'A different origin and process each time' }
  },

  /* ---------- Rating buttons ---------- */
  verdicts: { loved: 'Loved it', liked: 'Liked it', ok: 'It was OK', dislike: 'Not for me' },

  /* ---------- Brew methods (journal dropdown) ---------- */
  brews: { pourover: 'Pour-over', aeropress: 'AeroPress', frenchpress: 'French press', filter: 'South Indian filter', moka: 'Moka pot', espresso: 'Espresso', coldbrew: 'Cold brew', instant: 'Instant', cafe: 'Café' },

  /* ---------- Shelf freshness windows (days after roasting) ----------
     [start of best window, end of best window] per roast level. */
  freshness: { light: [10, 45], 'medium-light': [8, 40], medium: [7, 35], 'medium-dark': [5, 28], dark: [4, 24] },
  openedBagDays: 30,
  defaultDoseGrams: 15,

  footer: 'Coffees, prices and photos come from each roaster’s own shop and are refreshed every day. Freshness windows are rules of thumb for whole-bean pour-over.'
};
