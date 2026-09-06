/**
 * The 100-day morning motivation cycle.
 *
 * Day N is computed, never stored: elapsed days since the account was created
 * (in the user's own timezone) picks an index, and a seeded shuffle of [0..99]
 * reorders the whole set on each pass. So day 101 restarts the cycle in a
 * different order rather than replaying day 1 verbatim. The arithmetic lives
 * in src/lib/motivation.ts.
 *
 * `id` is the stable identity of a quote and is what the shuffle indexes over.
 * Never renumber. Replacing a quote's text and author in place is fine, and is
 * how the flagged entries below should be resolved.
 *
 * BUDGET: a notification body shows roughly 110 characters before the reader
 * has to expand the banner. Thirteen entries exceed that today.
 *
 * FLAGGED: 21 entries carry a `flag`. Three are marked MUST FIX and should not
 * reach production in their current form. The rest are attribution or length
 * problems. Resolve one by editing its text and author here and deleting the
 * flag - nothing else reads that field.
 */

export interface MotivationQuote {
  /** Stable identity, 1-100. The shuffle indexes over these. Never renumber. */
  id: number;
  text: string;
  author: string;
  /** Set while this entry still needs an editorial decision. Delete when resolved. */
  flag?: string;
}

/** Characters of body text a lock-screen banner shows before expansion. */
export const NOTIFICATION_BODY_BUDGET = 110;

export const MOTIVATION_QUOTES: MotivationQuote[] = [
  {
    id: 1,
    text: "There are no gains without pains.",
    author: "Benjamin Franklin",
  },
  {
    id: 2,
    text: "Don't count the days, make the days count.",
    author: "Muhammad Ali",
  },
  {
    id: 3,
    text: "The body achieves what the mind believes.",
    author: "Napoleon Hill",
    flag: "attribution unverified - no primary source ties this to Napoleon Hill",
  },
  {
    id: 4,
    text: "The only bad workout is the one that didn't happen.",
    author: "Unknown",
  },
  {
    id: 5,
    text: "Take care of your body. It's the only place you have to live.",
    author: "Jim Rohn",
  },
  {
    id: 6,
    text: "The real workout starts when you want to stop.",
    author: "Jim Rohn",
    flag: "misattributed - this is Ronnie Coleman, not Jim Rohn",
  },
  {
    id: 7,
    text: "Pain is weakness leaving the body.",
    author: "United States Marine Corps",
    flag: "MUST FIX - tells users of a health app to train through pain",
  },
  {
    id: 8,
    text: "The last three or four reps is what makes the muscle grow.",
    author: "Arnold Schwarzenegger",
  },
  {
    id: 9,
    text: "I hated every minute of training, but I said, 'Don't quit. Suffer now and live the rest of your life as a champion.'",
    author: "Muhammad Ali",
    flag: "over budget (116 chars)",
  },
  {
    id: 10,
    text: "You just can't beat the person who never gives up.",
    author: "Babe Ruth",
  },
  {
    id: 11,
    text: "Most people fail, not because of lack of desire, but because of lack of commitment.",
    author: "Vince Lombardi",
  },
  {
    id: 12,
    text: "All progress takes place outside the comfort zone.",
    author: "Michael John Bobak",
  },
  {
    id: 13,
    text: "If you want something you've never had, you must be willing to do something you've never done.",
    author: "Thomas Jefferson",
    flag: "misattributed - not Thomas Jefferson",
  },
  {
    id: 14,
    text: "Exercise should be regarded as tribute to the heart.",
    author: "Gene Tunney",
  },
  {
    id: 15,
    text: "Once you are exercising regularly, the hardest thing is to stop it.",
    author: "Erin Gray",
  },
  {
    id: 16,
    text: "Reading is to the mind what exercise is to the body.",
    author: "Joseph Addison",
  },
  {
    id: 17,
    text: "He that is good for making excuses is seldom good for anything else.",
    author: "Benjamin Franklin",
  },
  {
    id: 18,
    text: "It's easier to stay in shape if you never let yourself get out of shape in the first place.",
    author: "Bill Loguidice",
  },
  {
    id: 19,
    text: "Weight loss doesn't begin in the gym with a dumbbell; it starts in your head with a decision.",
    author: "Toni Sorenson",
  },
  {
    id: 20,
    text: "Tough times never last, but tough people do!",
    author: "Robert H. Schuller",
  },
  {
    id: 21,
    text: "The only bad exercise is the one you skipped.",
    author: "Amit Kalantri",
  },
  {
    id: 22,
    text: "Going to gym for 5 minutes might not transform your body, but it does reaffirm your identity.",
    author: "James Clear",
  },
  {
    id: 23,
    text: "A year from now you may wish you had started today.",
    author: "Karen Lamb",
  },
  {
    id: 24,
    text: "The difference between try and triumph is a little umph.",
    author: "Marvin Phillips",
  },
  {
    id: 25,
    text: "To give anything less than your best is to sacrifice the gift.",
    author: "Steve Prefontaine",
  },
  {
    id: 26,
    text: "Everybody wants to be a bodybuilder, but don't nobody wanna lift no heavy ass weight.",
    author: "Ronnie Coleman",
    flag: "MUST FIX - profanity on a lock screen",
  },
  {
    id: 27,
    text: "If you always do what you did, you'll always get what you got.",
    author: "Unknown",
  },
  {
    id: 28,
    text: "Ain't nothing to it but to do it.",
    author: "Ronnie Coleman",
  },
  {
    id: 29,
    text: "When you hit failure, your workout has just begun.",
    author: "Ronnie Coleman",
  },
  {
    id: 30,
    text: "We all have dreams. But in order to make dreams come into reality, it takes an awful lot of determination, dedication, self-discipline, and effort.",
    author: "Jesse Owens",
    flag: "over budget (147 chars)",
  },
  {
    id: 31,
    text: "If your goals don't scare you they aren't big enough.",
    author: "Unknown",
  },
  {
    id: 32,
    text: "Don't train because you hate your body, train because you love your body.",
    author: "Unknown",
  },
  {
    id: 33,
    text: "Work hard in silence. Let your success be the noise.",
    author: "Unknown",
  },
  {
    id: 34,
    text: "The only way to achieve the impossible is to believe it is possible.",
    author: "Charles Kingsleigh",
    flag: "Charles Kingsleigh is a character invented for the 2010 Alice in Wonderland film",
  },
  {
    id: 35,
    text: "Success is not a destination, it is a journey.",
    author: "Zig Ziglar",
  },
  {
    id: 36,
    text: "Positive anything is better than negative nothing.",
    author: "Elbert Hubbard",
  },
  {
    id: 37,
    text: "The difference between ordinary and extraordinary is that little extra.",
    author: "Jimmy Johnson",
  },
  {
    id: 38,
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  {
    id: 39,
    text: "The only impossible journey is the one you never begin.",
    author: "Tony Robbins",
  },
  { id: 40, text: "What you seek is seeking you.", author: "Rumi" },
  {
    id: 41,
    text: "The best revenge is massive success.",
    author: "Frank Sinatra",
  },
  {
    id: 42,
    text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    author: "Aristotle",
  },
  {
    id: 43,
    text: "Your love for what you do and your willingness to push yourself where others aren't prepared to go is what will make you great.",
    author: "Laurence Shahlaei",
    flag: "over budget (127 chars)",
  },
  {
    id: 44,
    text: "The clock is ticking. Are you becoming the person you want to be?",
    author: "Unknown",
  },
  {
    id: 45,
    text: "Do something today that your future self will thank you for.",
    author: "Sean Patrick Flanery",
  },
  {
    id: 46,
    text: "The dictionary is the only place that success comes before work.",
    author: "Vince Lombardi",
  },
  {
    id: 47,
    text: "Strong people are harder to kill than weak people and more useful in general.",
    author: "Mark Rippetoe",
  },
  {
    id: 48,
    text: "If something stands between you and your success, move it. Never be denied.",
    author: "Dwayne The Rock Johnson",
  },
  {
    id: 49,
    text: "The resistance that you fight physically in the gym and the resistance that you fight in life can only build a strong character.",
    author: "Arnold Schwarzenegger",
    flag: "over budget (128 chars)",
  },
  {
    id: 50,
    text: "The greatest feeling you can get in a gym is the pump.",
    author: "Arnold Schwarzenegger",
  },
  {
    id: 51,
    text: "Motivation is what gets you started. Habit is what keeps you going.",
    author: "Jim Rohn",
  },
  {
    id: 52,
    text: "Physical fitness is not only one of the most important keys to a healthy body, it is the basis of dynamic and creative intellectual activity.",
    author: "John F. Kennedy",
    flag: "over budget (141 chars)",
  },
  {
    id: 53,
    text: "Your body can stand almost anything. It's your mind that you have to convince.",
    author: "Unknown",
  },
  {
    id: 54,
    text: "Do what you have to do until you can do what you want to do.",
    author: "Oprah Winfrey",
  },
  {
    id: 55,
    text: "Never say never because limits, like fears, are often just illusions.",
    author: "Michael Jordan",
  },
  {
    id: 56,
    text: "I always felt my greatest asset wasn't my physical ability, it was my mental ability.",
    author: "Bruce Jenner",
    flag: "MUST FIX - deadnames Caitlyn Jenner",
  },
  {
    id: 57,
    text: "I know what I can do, so I never doubt myself.",
    author: "Usain Bolt",
  },
  {
    id: 58,
    text: "If you don't have confidence, you'll always find a way not to win.",
    author: "Carl Lewis",
  },
  {
    id: 59,
    text: "Hard work beats talent when talent doesn't work hard.",
    author: "Unknown",
  },
  {
    id: 60,
    text: "Champions are built when no one is watching.",
    author: "Unknown",
  },
  { id: 61, text: "Your attitude is your advantage.", author: "Unknown" },
  {
    id: 62,
    text: "You have to train your mind like you train your body.",
    author: "Unknown",
  },
  {
    id: 63,
    text: "Concentration and mental toughness are the margins of victory.",
    author: "Unknown",
  },
  {
    id: 64,
    text: "Motivation determines what you do. Attitude determines how well you do it.",
    author: "Unknown",
  },
  {
    id: 65,
    text: "I've missed more than 9000 shots in my career. I've lost almost 300 games. 26 times, I've been trusted to take the game winning shot and missed. I've failed over and over and over again in my life. And that is why I succeed.",
    author: "Michael Jordan",
    flag: "over budget - roughly 3x what a banner shows (224 chars)",
  },
  {
    id: 66,
    text: "Champions aren't made in the gyms. Champions are made from something they have deep inside them - a desire, a dream, a vision.",
    author: "Muhammad Ali",
    flag: "over budget (126 chars)",
  },
  {
    id: 67,
    text: "Strength does not come from winning. Your struggles develop your strengths.",
    author: "Unknown",
  },
  {
    id: 68,
    text: "When you go through hardships and decide not to surrender, that is strength.",
    author: "Unknown",
  },
  {
    id: 69,
    text: "Champions have to have the skill and the will. But the will must be stronger than the skill.",
    author: "Unknown",
  },
  {
    id: 70,
    text: "If you run into a wall, don't turn around and give up. Figure out how to climb it, go through it, or work around it.",
    author: "Michael Jordan",
    flag: "over budget (116 chars)",
  },
  {
    id: 71,
    text: "Today I will do what others won't, so tomorrow I can accomplish what others can't.",
    author: "Unknown",
  },
  {
    id: 72,
    text: "Competitive toughness is an acquired skill and not an inherited gift.",
    author: "Unknown",
  },
  {
    id: 73,
    text: "It is not the mountain we conquer, but ourselves.",
    author: "Unknown",
  },
  {
    id: 74,
    text: "Pain is temporary. It may last a minute, or an hour, or a day, or a year, but eventually it will subside. If I quit, however, it lasts forever.",
    author: "Unknown",
    flag: "over budget; also misattributed - this is Lance Armstrong (143 chars)",
  },
  {
    id: 75,
    text: "Mental toughness is to physical as four is to one.",
    author: "Unknown",
  },
  {
    id: 76,
    text: "Nothing great was ever achieved without enthusiasm.",
    author: "Ralph Waldo Emerson",
  },
  {
    id: 77,
    text: "Golf is a game that is played on a five-inch course - the space between your ears.",
    author: "Bobby Jones",
  },
  {
    id: 78,
    text: "If you deliberately plan on being less than you are capable of being, then I warn you that you'll be unhappy for the rest of your life.",
    author: "Abraham Maslow",
    flag: "over budget (135 chars)",
  },
  {
    id: 79,
    text: "Who looks outside, dreams; who looks inside, awakes.",
    author: "Carl Jung",
  },
  { id: 80, text: "Becoming is better than being.", author: "Carol S. Dweck" },
  {
    id: 81,
    text: "The best years of your life are the ones in which you decide your problems are your own. You realize that you control your own destiny.",
    author: "Albert Ellis",
    flag: "over budget (135 chars)",
  },
  {
    id: 82,
    text: "Everybody should do at least two things each day that he hates to do, just for practice.",
    author: "William James",
  },
  {
    id: 83,
    text: "I suppose it is tempting, if the only tool you have is a hammer, to treat everything as if it were a nail.",
    author: "Abraham Maslow",
  },
  {
    id: 84,
    text: "Willpower is essential to the accomplishment of anything worthwhile.",
    author: "Brian Tracy",
  },
  {
    id: 85,
    text: "Discipline is choosing between what you want now and what you want most.",
    author: "Abraham Lincoln",
    flag: "misattributed - not Abraham Lincoln",
  },
  {
    id: 86,
    text: "Your brain is not designed to make you happy. That's your job.",
    author: "Unknown",
  },
  {
    id: 87,
    text: "Few things in the world are more powerful than a positive push. A smile. A world of optimism and hope. A 'you can do it' when things are tough.",
    author: "Richard M. Devos",
    flag: "over budget (143 chars)",
  },
  {
    id: 88,
    text: "I am not a product of my circumstances. I am a product of my decisions.",
    author: "Stephen Covey",
  },
  {
    id: 89,
    text: "The will of man is his happiness.",
    author: "Friedrich Schiller",
  },
  {
    id: 90,
    text: "Willpower is the key to success. Successful people strive no matter what they feel by applying their will to overcome apathy, doubt or fear.",
    author: "Dan Millman",
    flag: "over budget (140 chars)",
  },
  {
    id: 91,
    text: "The sure-thing boat never gets far from shore.",
    author: "Dale Carnegie",
  },
  {
    id: 92,
    text: "We know what we are but not what we may be.",
    author: "Ophelia (Shakespeare, Hamlet)",
  },
  {
    id: 93,
    text: "The brain is wider than the sky.",
    author: "Emily Dickinson",
  },
  {
    id: 94,
    text: "Set your goals high and don't stop till you get there.",
    author: "Bo Jackson",
  },
  {
    id: 95,
    text: "Setting goals is the first step in turning the invisible into the visible.",
    author: "Tony Robbins",
  },
  {
    id: 96,
    text: "To keep the body in good health is a duty... otherwise we shall not be able to keep our mind strong and clear.",
    author: "Buddha",
  },
  {
    id: 97,
    text: "Health is the greatest gift, contentment the greatest wealth.",
    author: "Buddha",
  },
  {
    id: 98,
    text: "Health is a state of complete harmony of the body, mind, and spirit.",
    author: "B.K.S. Iyengar",
  },
  {
    id: 99,
    text: "The pain you feel today will be the strength you feel tomorrow.",
    author: "Unknown",
  },
  { id: 100, text: "You are stronger than you think.", author: "Unknown" },
];

/** Entries still carrying an unresolved editorial flag. */
export const FLAGGED_QUOTES = MOTIVATION_QUOTES.filter((q) => q.flag);

/**
 * Entries whose body overflows the collapsed banner.
 *
 * Not fatal - the OS truncates rather than fails - but a quote the reader has
 * to expand to finish is a quote that did not land at 7am.
 */
export const OVER_BUDGET_QUOTES = MOTIVATION_QUOTES.filter(
  (q) => q.text.length > NOTIFICATION_BODY_BUDGET,
);
