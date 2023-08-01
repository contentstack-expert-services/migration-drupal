/**
 * Updated by Saurav on 13/03/23.
 */
var mkdirp = require("mkdirp"),
  path = require("path"),
  fs = require("fs"),
  when = require("when"),
  guard = require("when/guard"),
  parallel = require("when/parallel"),
  sequence = require("when/sequence"),
  phpUnserialize = require("phpunserialize"),
  limit = 5;

const chalk = require("chalk");
/**
 * Internal module Dependencies.
 */
const { JSDOM } = require("jsdom");
const { htmlToJson } = require("@contentstack/json-rte-serializer");

var helper = require("../../libs/utils/helper.js");
const { resolveObject } = require("url");

var entriesConfig = config.modules.entries,
  entriesFolderPath = path.resolve(config.data, entriesConfig.dirName);

function ExtractPosts() {
  this.connection = helper.connect();
}

ExtractPosts.prototype = {
  putPosts: function (postsdetails, key) {
    var self = this;
    // let assetId = helper.readFile(
    //   path.join(process.cwd(), "drupalMigrationData", "assets", "assets.json")
    // );
    let referenceId = helper.readFile(
      path.join(
        process.cwd(),
        "drupalMigrationData",
        "references",
        "references.json"
      )
    );
    let taxonomyId = helper.readFile(
      path.join(
        process.cwd(),
        "drupalMigrationData",
        "entries",
        "taxonomy",
        "en-us.json"
      )
    );
    var folderpath = entriesFolderPath + "/" + key;
    masterFolderPath = path.resolve(config.data, "master", config.entryfolder);
    if (!fs.existsSync(folderpath)) {
      mkdirp.sync(folderpath);
      helper.writeFile(path.join(folderpath, "en-us.json"));
      mkdirp.sync(masterFolderPath);
      helper.writeFile(
        path.join(masterFolderPath, key + ".json"),
        '{"en-us":{}}'
      );
    }
    var contenttype = helper.readFile(path.join(folderpath, "en-us.json"));
    var mastercontenttype = helper.readFile(
      path.join(masterFolderPath, key + ".json")
    );
    return when.promise(function (resolve, reject) {
      var field_name = Object.keys(postsdetails[0]);
      var isoDate = new Date();
      var contentTypeQuery = config["mysql-query"]["ct_mapped"];
// console.log(postsdetails)
      self.connection.query(contentTypeQuery, function (error, rows, fields) {
        for (var i = 0; i < rows.length; i++) {
          var conv_details = phpUnserialize(rows[i].data);
          for (const [Fieldkey, data] of Object.entries(postsdetails)) {

            for (const [dataKey, value] of Object.entries(data)) {
              // console.log([dataKey, value])
              //for image and files
              if (
                conv_details.field_type === "file" ||
                conv_details.field_type === "image"
              ) {
                if (
                  dataKey === `${conv_details.field_name}_target_id` &&
                  (conv_details.field_type === "file" ||
                    conv_details.field_type === "image")
                ) {
                  // if (
                  //   `assets_${value}` in assetId &&
                  //   dataKey === `${conv_details.field_name}_target_id` &&
                  //   (conv_details.field_type === "file" ||
                  //     conv_details.field_type === "image")
                  // ) {
                  //   data[dataKey] = assetId[`assets_${value}`];
                  // }
                }
              }

              // for references
              if (conv_details.field_type === "entity_reference") {
                if (
                  conv_details?.settings?.handler === "default:taxonomy_term" &&
                  typeof value === "number" &&
                  dataKey === `${conv_details.field_name}_target_id`
                ) {
                  if (
                    `taxonomy_${value}` in taxonomyId &&
                    conv_details?.settings?.handler ===
                      "default:taxonomy_term" &&
                    typeof value === "number"
                  ) {
                    data[dataKey] = [
                      {
                        uid: `taxonomy_${value}`,
                        _content_type_uid: "taxonomy",
                      },
                    ];
                  }
                }
                if (
                  conv_details?.settings?.handler === "default:node" &&
                  typeof value === "number" &&
                  dataKey === `${conv_details.field_name}_target_id`
                ) {
                  if (
                    typeof value === "number" &&
                    dataKey === `${conv_details.field_name}_target_id`
                  ) {
                    if (`content_type_entries_title_${value}` in referenceId) {
                      data[dataKey] = [
                        referenceId[`content_type_entries_title_${value}`],
                      ];
                    }
                  }
                }
              }

              // for datetime and timestamps
              if (
                conv_details.field_type === "datetime" ||
                conv_details.field_type === "timestamp"
              ) {
                if (`${conv_details.field_name}_value` === dataKey) {
                  if (typeof value === "number") {
                    const unixDate = new Date(value * 1000).toISOString();
                    data[dataKey] = unixDate;
                  } else {
                    data[dataKey] = isoDate.toISOString(value);
                  }
                }
              }

              if (conv_details.field_type === "boolean") {
                if (
                  dataKey === `${conv_details.field_name}_value` &&
                  typeof value === "number"
                ) {
                  if (typeof value === "number" && value === 1) {
                    data[dataKey] = true;
                  } else if (typeof value === "number" && value === 0) {
                    data[dataKey] = false;
                  }
                }
              }

              if (conv_details.field_type === "comment") {
                if (
                  dataKey === `${conv_details.field_name}_status` &&
                  typeof value === "number"
                ) {
                  data[dataKey] = `${value}`;
                }
              }

              if (value === null) {
                delete data[dataKey];
              }
            }

            var ct_value = {};
            var date;

            for (var key in field_name) {
              // console.log(field_name[key])
              var re = field_name[key].endsWith("_tid");
              if (field_name[key] == "created") {
                date = new Date(data[field_name[key]] * 1000);
                ct_value[field_name[key]] = date.toISOString();
              } else if (field_name[key] == "uid_name") {
                ct_value[field_name[key]] = [data[field_name[key]]];
              } else if (re) {
                ct_value[field_name[key]] = [data[field_name[key]]];
              } else if (field_name[key] == "nid") {
                ct_value.uid = `content_type_entries_title_${data["nid"]}`;
              } else if (field_name[key] == "langcode") {
                ct_value.locale = "en-us";
              } else if (field_name[key].endsWith("_uri")) {
                if (data[field_name[key]]) {
                  ct_value[field_name[key].replace("_uri", "")] = {
                    title: data[field_name[key]],
                    href: data[field_name[key]],
                  };
                } else {
                  ct_value[field_name[key].replace("_uri", "")] = {
                    title: "",
                    href: "",
                  };
                }
              } else if (field_name[key].endsWith("_value")) {
                if (/<\/?[a-z][\s\S]*>/i.test(data[field_name[key]])) {
                  const dom = new JSDOM(data[field_name[key]]);
                  let htmlDoc = dom.window.document.querySelector("body");
                  const jsonValue = htmlToJson(htmlDoc);
                  ct_value[field_name[key].replace("_value", "")] = jsonValue;
                } else {
                  ct_value[field_name[key].replace("_value", "")] =
                    data[field_name[key]];
                }
              } else if (field_name[key].endsWith("_status")) {
                ct_value[field_name[key].replace("_status", "")] =
                  data[field_name[key]];
              } else {
                if (/<\/?[a-z][\s\S]*>/i.test(data[field_name[key]])) {
                  const dom = new JSDOM(data[field_name[key]]);
                  let htmlDoc = dom.window.document.querySelector("body");
                  const jsonValue = htmlToJson(htmlDoc);
                  ct_value[field_name[key]] = jsonValue;
                } else {
                  ct_value[field_name[key]] = data[field_name[key]];
                }
              }

              if (typeof data["nid"] === "number") {
                contenttype[`content_type_entries_title_${data["nid"]}`] =
                  ct_value;
              }
              mastercontenttype["en-us"][data["nid"]] = "";
            }
          }
          helper.writeFile(
            path.join(folderpath, "en-us.json"),
            JSON.stringify(contenttype, null, 4)
          );
          helper.writeFile(
            path.join(masterFolderPath, key + ".json"),
            JSON.stringify(mastercontenttype, null, 4)
          );
          resolve({ last: contenttype });
        }
      });
    });
  },
  getQuery: function (pagename, skip, queryPageConfig) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var query = queryPageConfig["page"]["" + pagename + ""];
      query = query + " limit " + skip + ", " + limit;
      // query = query;
      // console.log(query)
      self.connection.query(query, function (error, rows, fields) {
        if (!error) {
          if (rows.length > 0) {
            // console.log(rows.length)
            self
              .putPosts(rows, pagename)
              .then(function (results) {
                // Object.keys(results.last).forEach(el=>{
                //   a
                // })
                let allUids = rows.map(r=>r.nid)
                allUids.forEach(element => {
                  console.log("info: Exporting entries for",chalk.green(`${pagename}`),"with uid",chalk.green(`${element}`))
                });
                // console.log(
                //   "Exporting entries for",
                //   chalk.green(`${pagename}`)
                // );
                resolve(results);
              })
              .catch(function () {
                reject();
              });
          } else {
            console.log("no entries found for", chalk.red.bold(`${pagename}`));
            resolve();
          }
        } else {
          errorLogger("Completed to export for entries: ", error);
          reject(error);
        }
      });
    });
  },
  getPageCount: function (pagename, queryPageConfig) {
    // console.log("Page Name is ", pagename)
    // console.log("Page Name is ", queryPageConfig)
    // console.log("This is", this)
    // return;
 
      // return;
    var self = this;
    return when.promise(function (resolve, reject) {
      var query = queryPageConfig["count"]["" + pagename + "Count"];
      // query = query + " limit " + skip + ", " + limit;
      query = query;
      self.connection.query(query, function (error, rowsCount, fields) {
        if(error){console.log(error)}
        // console.log("rowsCount is ",)
      var _getPage = [];
        // console.log(pagename)
      for (var i = 0, total = rowsCount[0].countentry; i < total+limit; i += limit) {
        // console.log(i)
        _getPage.push(
          (function (data) {
   
            return function () {
              return self.getQuery(pagename, data, queryPageConfig);
            };
          })(i)
        );
      }
      var guardTask = guard.bind(null, guard.n(1));
      _getPage = _getPage.map(guardTask);
      var taskResults = parallel(_getPage);
      taskResults
        .then(function (results) {
          resolve();
        })
        .catch(function (e) {
          errorLogger(
            "something wrong while exporting entries" + pagename + ":",
            e
          );
          reject(e);
        });
    });
  })
  },
  start: function () {
    successLogger("Exporting entries...");
    var self = this;

    return when.promise(function (resolve, reject) {
      var queryPageConfig =  helper.readFile(
        path.join(process.cwd(), "drupalMigrationData", "query", "index.json")
      );
      var pagequery = queryPageConfig.page;
      var _getPage = [];
// console.log(pagequery)
      for (var key in pagequery) {
        _getPage.push(
          (function (key) {
            return function () {
              return self.getPageCount(key, queryPageConfig);
            };
          })(key)
        );
      }
      var taskResults = sequence(_getPage);
      taskResults
        .then(function (results) {
          self.connection.end();
          resolve();
        })
        .catch(function (e) {
          errorLogger(
            "something wrong while exporting entries " + key + ": ",
            e
          );
          reject(e);
        });
    });
  },
};

module.exports = ExtractPosts;
