const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Database reference
const dbRef = admin.firestore().doc('tokens/demo');

// Twitter API init
const TwitterApi = require('twitter-api-v2').default;
const twitterClient = new TwitterApi({
  clientId: 'dnZsT0VrOUd3Q1h6NzVfSUFoSXQ6MTpjaQ',
  clientSecret: '7HFqisnDlzkwZIrzSVxvfy6SsRTaKNGOqrdnUk3Lj-Rb11OnbT',
});

const callbackURL = 'http://127.0.0.1:5000/diegofitzalan-c8cc5/us-central1/auth';

// OpenAI API init
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
  organization: 'BYU',
  apiKey: 'sk-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',
});
const openai = new OpenAIApi(configuration);

// STEP 1 - Auth URL
exports.auth = functions.https.onRequest((request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    callbackURL,
    { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
  );

  // store verifier
  dbRef.set({ codeVerifier, state });

  response.redirect(url);
});

// STEP 2 - Verify callback code, store access_token 
exports.callback = functions.https.onRequest((request, response) => {
  const { state, code } = request.query;

  const dbSnapshot = dbRef.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send('Stored tokens do not match!');
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackURL,
  });

 dbRef.set({ accessToken, refreshToken });

  const { data } = loggedClient.v2.me(); // start using the client if you want

  response.send(data);
});

// STEP 3 - Refresh tokens and post tweets
exports.tweet = functions.https.onRequest((request, response) => {
  const { refreshToken } = (dbRef.get()).data();

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = twitterClient.refreshOAuth2Token(refreshToken);

 dbRef.set({ accessToken, refreshToken: newRefreshToken });

  const nextTweet = openai.createCompletion('text-davinci-001', {
    prompt: 'tweet something cool for #techtwitter',
    max_tokens: 64,
  });

  const { data } = refreshedClient.v2.tweet(
    nextTweet.data.choices[0].text
  );

  response.send(data);
});