import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

export const mergeAnonymousResults = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before claiming guest results.");
  const { sourceUid, sourceToken } = request.data as { sourceUid?: string; sourceToken?: string };
  if (!sourceUid || !sourceToken) throw new HttpsError("invalid-argument", "Guest identity is required.");
  const source = await getAuth().verifyIdToken(sourceToken);
  if (source.uid !== sourceUid || source.firebase.sign_in_provider !== "anonymous") throw new HttpsError("permission-denied", "This guest history cannot be claimed.");

  const db = getFirestore();
  const sourceResults = await db.collection("users").doc(sourceUid).collection("results").get();
  const batch = db.batch();
  for (const result of sourceResults.docs) {
    batch.set(db.collection("users").doc(request.auth.uid).collection("results").doc(`guest_${result.id}`), result.data());
    batch.delete(result.ref);
  }
  batch.delete(db.collection("users").doc(sourceUid));
  await batch.commit();
  await getAuth().deleteUser(sourceUid);
  return { merged: sourceResults.size };
});
