/**
 * Created by pradeep on 6/3/17.
 */
 var mkdirp = require("mkdirp"),
 path = require("path"),
 fs = require("fs"),
 when = require("when"),
 guard = require("when/guard"),
 parallel = require("when/parallel");

const { JSDOM } = require("jsdom");
const { htmlToJson } = require("@contentstack/json-rte-serializer");
/**
* Internal module Dependencies.
*/
var helper = require("../utils/helper");
let { localeSwitch } = require("./localeSwitch");

var vocabularyConfig = config.modules.vocabulary,
 vocabularyFolderPath = path.resolve(
   config.data,
   config.entryfolder,
   vocabularyConfig.dirName
 ),
 limit = 100;



/**
* Create folders and files
*/

function ExtractVocabulary() {
 this.connection = helper.connect();
}

ExtractVocabulary.prototype = {
 putVocabulary: function (vocabulary) {
   var vocabularyData = {};

   return when.promise(function (resolve, reject) {
     vocabulary.map(function (data, index) {
       let localeCode = localeSwitch(data.langcode);
       var description = data["description"] || "";

       // for HTML RTE to JSON RTE convert
       const dom = new JSDOM(description.replace(/&amp;/g, "&"));
       let htmlDoc = dom.window.document.querySelector("body");
       const jsonValue = htmlToJson(htmlDoc);
       description = jsonValue;

       let uid = `${data.vid}_${data["title"].toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`;
       
       if(data.langcode === localeCode.drupalLocale){
         helper.writeFile(
           path.join(vocabularyFolderPath,  `${localeCode.csLocale}.json`),
           JSON.stringify(vocabularyData, null, 4)
         );
       }

       vocabularyData = helper.readFile(
         path.join(vocabularyFolderPath, `${localeCode.csLocale}.json`)
       );

       if(data.langcode === localeCode.drupalLocale){
        vocabularyData[uid] = {
          uid: uid,
          locale: localeCode.csLocale,
          title: data["title"],
          description: description,
        };
       } 

       if(data.langcode === localeCode.drupalLocale){
         helper.writeFile(
           path.join(vocabularyFolderPath,  `${localeCode.csLocale}.json`),
           JSON.stringify(vocabularyData, null, 4)
         );
       }
     });
     resolve();
   });
 },
 getAllVocabularies: function (skip) {
   var self = this;
   return when.promise(function (resolve, reject) {
     var query = config["mysql-query"]["vocabulary"];
     query = query + " limit " + skip + ", " + limit;
     self.connection.query(query, function (error, rows, fields) {
       if (!error) {
         if (rows.length > 0) {
           self.putVocabulary(rows);
           resolve();
         }
       } else {
         errorLogger("failed to get vocabulary: ", error);
         reject(error);
       }
     });
   });
 },
 getVocabulariesCount: function (vocabularycount) {
   var self = this;
   return when.promise(function (resolve, reject) {
     var _getVocabulary = [];
     for (var i = 0, total = vocabularycount; i < total; i += limit) {
       _getVocabulary.push(
         (function (data) {
           return function () {
             return self.getAllVocabularies(data);
           };
         })(i)
       );
     }
     var guardTask = guard.bind(null, guard.n(1));
     _getVocabulary = _getVocabulary.map(guardTask);
     var taskResults = parallel(_getVocabulary);
     taskResults
       .then(function (results) {
         self.connection.end();
         resolve();
       })
       .catch(function (e) {
         errorLogger("something wrong while exporting vocabularies:", e);
         reject(e);
       });
   });
 },
 start: function () {
   var self = this;
   if (!fs.existsSync(vocabularyFolderPath)) {
     mkdirp.sync(vocabularyFolderPath);
   }
   return when.promise(function (resolve, reject) {

     self.connection.connect();
     var query = config["mysql-query"]["vocabularyCount"];
     self.connection.query(query, function (error, rows, fields) {
       if (!error) {
         var vocabularycount = rows[0]["vocabularycount"];
         if (vocabularycount > 0) {
           self
             .getVocabulariesCount(vocabularycount)
             .then(function () {
               resolve();
             })
             .catch(function () {
               reject();
             });
         } else {
           errorLogger("no vocabulary found");
           self.connection.end();
           resolve();
         }
       } else {
         errorLogger("failed to get vocabulary count: ", error);
         self.connection.end();
         reject(error);
       }
     });
   });
 },
};

module.exports = ExtractVocabulary;
