'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Translate = require('@google-cloud/translate');
const translate = Translate({keyFilename: "service-account-credentials.json"});

let languagesEnum = {
  ENGLISH: 1,
  SPANISH: 2,
  PORTUGUESE: 3,
  GERMAN: 4,
  FRENCH: 5
};

// sample: ["en", "es", "pt", "de", "ja", "hi", "nl"]
let languages = [
  {
    id: languagesEnum.ENGLISH,
    abbreviation: 'en',
    name: 'English'
  },
  {
    id: languagesEnum.SPANISH,
    abbreviation: 'es',
    name: 'Spanish'
  },
  {
    id: languagesEnum.PORTUGUESE,
    abbreviation: 'pt',
    name: 'Portuguese'
  },
  {
    id: languagesEnum.GERMAN,
    abbreviation: 'de',
    name: 'German'
  },
  {
    id: languagesEnum.FRENCH,
    abbreviation: 'fr',
    name: 'French'
  }
];

function getLanguageWithoutLocale(languageCode) {
  if (languageCode.indexOf("-") >= 0) {
    return languageCode.substring(0, languageCode.indexOf("-"));
  }
  return languageCode;
}

exports.rtdbTranslator = functions.database
  .ref('/room-messages/{roomId}/TRANSLATE/{messageId}')
  .onWrite((event) => {
    const message = event.data.val();
    let text = message.message ? message.message : message;
    let languageOriginal = languages.find(element => element.id === message.language);

    // all supported languages: https://cloud.google.com/translate/docs/languages
    let from = languageOriginal.abbreviation ? getLanguageWithoutLocale(languageOriginal.abbreviation) : "en";

    let promises = languages.map(language => {
      let to = language.abbreviation;

      console.log(`translating from '${from}' to '${to}', text '${text}'`);

      // call the Google Cloud Platform Translate API
      if (from === to) {
        return event.data.adminRef.root
          .child("room-messages")
          .child(event.params.roomId)
          .child("OUTPUT")
          .child(event.params.messageId + '-' + to)
          .set(message);
      } else {
        return translate.translate(text, {
          from: from,
          to: to
        }).then(result => {
          // write the translation to the database
          let translation = result[0];

          message.language = language.id;
          message.message = translation;

          return event.data.adminRef.root
            .child("room-messages")
            .child(event.params.roomId)
            .child("OUTPUT")
            .child(event.params.messageId + '-' + to)
            .set(message);
        });
      }
    });
    return Promise.all(promises);
  });

exports.firestoreTranslator = functions.firestore
  .document('/room-messages/{roomId}/TRANSLATE/{messageId}')
  .onWrite((event) => {
    const message = event.data.data();
    let db = admin.firestore();

    let text = message.message ? message.message : message;
    let languageOriginal = languages.find(element => element.id === message.language);

    // all supported languages: https://cloud.google.com/translate/docs/languages
    let from = languageOriginal.abbreviation ? getLanguageWithoutLocale(languageOriginal.abbreviation) : "en";

    let promises = languages.map(language => {
      let to = language.abbreviation;

      console.log(`translating from '${from}' to '${to}', text '${text}'`);

      // call the Google Cloud Platform Translate API
      if (from === to) {
        return db.collection("room-messages")
          .doc(event.params.roomId)
          .collection("OUTPUT")
          .doc(event.params.messageId + '-' + to)
          .set(message);
      } else {
        return translate.translate(text, {
          from: from,
          to: to
        }).then(result => {
          // write the translation to the database
          let translation = result[0];

          message.language = language.id;
          message.message = translation;

          return db.collection("room-messages")
            .doc(event.params.roomId)
            .collection("OUTPUT")
            .doc(event.params.messageId + '-' + to)
            .set(message);
        });
      }
    });
    return Promise.all(promises);
  });
