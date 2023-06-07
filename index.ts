import { readFile, writeFile } from 'node:fs/promises';
import { BskyAgent, AtpSessionEvent, AtpSessionData, RichText } from '@atproto/api';

const userName: string = process.env.BLUESKY_USERNAME!;
const password: string = process.env.BLUESKY_PASSWORD!;
const sessionFilePath = './session.json';

const isDebugMode = false;
const logger = {
  debug: (...messages: Array<any>) => {
    if(isDebugMode) console.log(...messages);
  }
};

let savedAtpSessionData: AtpSessionData;

const agent = new BskyAgent({
  service: 'https://bsky.social',
  persistSession: (_atpSessionEvent: AtpSessionEvent, atpSessionData?: AtpSessionData) => {
    if(!atpSessionData) throw new Error('No Session Data To Persist. Did You Pass An Incorrect User Name Or Password?');
    savedAtpSessionData = atpSessionData;  // Store The Session Data For Reuse
    writeFile(sessionFilePath, JSON.stringify(atpSessionData), 'utf-8');
  }
});

const login = async () => {
  logger.debug(agent.session ? 'Already Logged In. Resume Session' : 'Logging In...');
  const atpSessionData = await readFile(sessionFilePath, 'utf-8').catch(() => null);  // See If We Have Saved Session Data
  if(atpSessionData) {
    logger.debug('Found Saved Session Data. Resuming Session...');
    savedAtpSessionData = JSON.parse(atpSessionData);
    await agent.resumeSession(savedAtpSessionData);
  }
  else {
    console.log('No Saved Session Data. Logging In...');
    await agent.login({
      identifier: userName,
      password  : password
    });
  }
  return agent;
};

const post = async (text: string) => {
  const richText = new RichText({
    text: text
  });
  await richText.detectFacets(agent);  // Automatically Detects Mentions And Links
  const postRecord = {
    $type    : 'app.bsky.feed.post',
    text     : richText.text,
    facets   : richText.facets,
    createdAt: new Date().toISOString()
  };
  const result = await agent.app.bsky.feed.post.create({
    repo: agent.session?.did
  }, postRecord);
  logger.debug('Post :', result);
};

const readText = async () => {
  process.stdin.resume();
  const text = await new Promise(resolve => process.stdin.once('data', resolve)).finally(() => process.stdin.pause()).then(text => text!.toString().trim());
  if(text === '') throw new Error('Please Input Text');
  return text;
};

(async () => {
  try {
    await login();
    const text = await readText();
    await post(text);
    console.log('Successfully Posted');
  }
  catch(error) {
    console.error('ERROR :');
    console.error(error);
  }
})();
