const { HttpsProxyAgent } = require('https-proxy-agent');
let instance;
function getFirebase(env = process.env) {
  if (instance) return instance;
  const proxy = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  // Configure gRPC before loading the SDK. Auth and credentials use HTTP(S).
  if (proxy && !env.grpc_proxy) env.grpc_proxy = proxy;
  const { getApps, initializeApp, cert, applicationDefault } = require('firebase-admin/app');
  const httpAgent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const app = getApps()[0] || initializeApp({
    credential: env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON), httpAgent)
      : applicationDefault(httpAgent),
    ...(httpAgent ? { httpAgent } : {})
  });
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const firestore = () => getFirestore(app);
  firestore.FieldValue = FieldValue;
  instance = { auth: () => getAuth(app), firestore };
  return instance;
}
module.exports = { getFirebase };
