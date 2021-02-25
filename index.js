const request = require('request');
const escapeStringRegexp = require('escape-string-regexp');
const async = require('async');
const fs = require('fs');
const MultiStream = require('multistream');
const fakeUa = require('fake-useragent');

const GOOGLE_TTS_URL = 'http://translate.google.com/translate_tts';
const MAX_CHARS = 100;
const LANGUAGES = {
  'af': 'Afrikaans',
  'sq': 'Albanian',
  'ar': 'Arabic',
  'hy': 'Armenian',
  'ca': 'Catalan',
  'zh': 'Chinese',
  'zh-cn': 'Chinese (Mandarin/China)',
  'zh-tw': 'Chinese (Mandarin/Taiwan)',
  'zh-yue': 'Chinese (Cantonese)',
  'hr': 'Croatian',
  'cs': 'Czech',
  'da': 'Danish',
  'nl': 'Dutch',
  'en': 'English',
  'en-au': 'English (Australia)',
  'en-uk': 'English (United Kingdom)',
  'en-us': 'English (United States)',
  'eo': 'Esperanto',
  'fi': 'Finnish',
  'fr': 'French',
  'de': 'German',
  'el': 'Greek',
  'ht': 'Haitian Creole',
  'hi': 'Hindi',
  'hu': 'Hungarian',
  'is': 'Icelandic',
  'id': 'Indonesian',
  'it': 'Italian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'la': 'Latin',
  'lv': 'Latvian',
  'mk': 'Macedonian',
  'no': 'Norwegian',
  'pl': 'Polish',
  'pt': 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  'ro': 'Romanian',
  'ru': 'Russian',
  'sr': 'Serbian',
  'sk': 'Slovak',
  'es': 'Spanish',
  'es-es': 'Spanish (Spain)',
  'es-us': 'Spanish (United States)',
  'sw': 'Swahili',
  'sv': 'Swedish',
  'ta': 'Tamil',
  'th': 'Thai',
  'tr': 'Turkish',
  'vi': 'Vietnamese',
  'cy': 'Welsh'
}

function Text2Speech(_lang, _debug) {
  let lang = _lang || 'en';
  const debug = _debug || false;
  lang = lang.toLowerCase();

  if (!LANGUAGES[lang])
    throw new Error('Language not supported: ' + lang);

  const getArgs = getArgsFactory(lang);

  return {
    tokenize: tokenize,
    createServer: (port) => createServer(getArgs, port),
    stream: (text) => stream(getArgs, text),
    save: (filepath, text, callback) => save(getArgs, filepath, text, callback)
  }
}

function save(getArgs, filepath, text, callback) {
  const text_parts = tokenize(text);
  const total = text_parts.length;
  async.eachSeries(text_parts, function(part, cb) {
    const index = text_parts.indexOf(part);
    const headers = getHeader();
    const args = getArgs(part, index, total);
    const fullUrl = GOOGLE_TTS_URL + args;

    const writeStream = fs.createWriteStream(filepath, {
      flags: index > 0 ? 'a' : 'w'
    });
    request({
        uri: fullUrl,
        headers: headers,
        method: 'GET'
      })
      .pipe(writeStream);
    writeStream.on('finish', cb);
    writeStream.on('error', cb);
  }, callback);
}

function stream(getArgs, text) {
  const text_parts = tokenize(text);
  const total = text_parts.length;

  return MultiStream(text_parts.map(function(part, index) {
    const headers = getHeader();
    const args = getArgs(part, index, total);
    const fullUrl = GOOGLE_TTS_URL + args

    return request({
      uri: fullUrl,
      headers: headers,
      method: 'GET'
    });
  }));
}

function getHeader() {
  const headers = {
    "User-Agent": fakeUa()
  };
  // console.log('headers', headers);
  return headers;
}

function getArgsFactory(lang){
  return function (text, index, total) {
    const textlen = text.length;
    const encodedText = encodeURIComponent(text);
    const language = lang || 'en';
    return `?ie=UTF-8&tl=${language}&q=${encodedText}&total=${total}&idx=${index}&client=tw-ob&textlen=${textlen}`
  }
}

function tokenize(text) {
  const text_parts = [];
  if (!text)
    throw new Error('No text to speak');

  const punc = '¡!()[]¿?.,;:—«»\n ';
  const punc_list = punc.split('').map(function(char) {
    return escapeStringRegexp(char);
  });

  const pattern = punc_list.join('|');
  let parts = text.split(new RegExp(pattern));
  parts = parts.filter(p => p.length > 0);

  let output = [];
  let i = 0;
  for (let p of parts) {
    if (!output[i]) {
      output[i] = '';
    }
    if (output[i].length + p.length < MAX_CHARS) {
      output[i] += ' ' + p;
    } else {
      i++;
      output[i] = p;
    }
  }
  output[0] = output[0].substr(1);
  return output;
}

function createServer(getArgs, port) {
  const http = require("http");
  const url = require('url');

  const server = http.createServer(function(req, res) {
    const queryData = url.parse(req.url, true).query;
    let argsCallback = getArgs;
    if (queryData && queryData.lang && LANGUAGES[queryData.lang]) {
      argsCallback = getArgsFactory(queryData.lang);
    }
    if (queryData && queryData.text) {
      res.writeHead(200, {'Content-Type': 'audio/mpeg'});
      stream(argsCallback, queryData.text).pipe(res);
    } else {
      // console.log(req.headers);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        code: -1,
        message: `Missing text. Please try: ${req.headers.host}?text=your+text`
      }))
    }
  });

  server.listen(port);
  // console.log("Text-to-Speech Server running on " + port);
}

module.exports = Text2Speech;
