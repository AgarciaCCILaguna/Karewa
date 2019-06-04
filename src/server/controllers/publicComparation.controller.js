const async = require('async');
const mongoose = require('mongoose');
const axios = require('axios');

const Contract = require('./../models/contract.model').Contract;
const Organization = require('./../models/organization.model').Organization;
const Calculation = require('./../models/calculation.model').Calculation;
const Comparation = require('./../models/comparation.model').Comparation;
const deletedSchema = require('./../models/schemas/deleted.schema');
const { PDFTable, PDFExporter } = require('./../components/pdfExporter');
const {ExcelExporter} = require('./../components/exporter');
const moment = require('moment');

const calculateAndValidateFormula = require('./../controllers/calculation.controller').calculateAndValidateFormula;
const logger = require('./../components/logger').instance;

// const variables = require('./../components/variablesSeed').variables;

exports.corruptionIndex = (req, res, next) => {
    let id = req.query.id;

    let qNotDeleted = deletedSchema.qNotDeleted();
    let currentOrganizationId = mongoose.Types.ObjectId(id);
    // let qByOrganization = {"organization": currentOrganizationId};

    let query = {...qNotDeleted/*, ...qByOrganization*/, locked: true};
    Calculation
        .findOne(query)
        .lean()
        .exec((err, corruptionIndex) => {

            if (err) {
                //Error
                logger.error(err, req, 'publicComparation.controller#corruptionIndex', 'Error trying to find Corruption index');
                return res.json({
                    error: true,
                    data: {}
                });
            } else if (!corruptionIndex) {
                //Not found
                logger.error(null, req, 'publicComparation.controller#corruptionIndex', 'Corruption index not found');
                // return res.json({
                //     error: true,
                //     data: {}
                // });
            }

            corruptionIndex = corruptionIndex || {};

            corruptionIndex.result = 0;

            if (!corruptionIndex._id) {
                return res.json({
                    error: true,
                    data: corruptionIndex
                });
            }

            let cache = {
                done: [],
                calls: [],
                i: 0,
                resultsMap: {},
            };

            Calculation.getEnabledCalculations(req, cache, currentOrganizationId, (err, calculationsInfo) => {
                
                let query = Calculation.qAdministrationPeriodFromYearToYear(corruptionIndex);

                calculateAndValidateFormula(req, cache, corruptionIndex._id, {query: query}, (err, result) => {
                    if (result && result.value) {
                        corruptionIndex.result = result.value;
                    }
    
                    return res.json({
                        error: true,
                        data: {
                            corruptionIndex,
                            calculationsInfo
                        }
                    });
                });
            });


        });
};

exports.detail = (req, res, next) => {

    const URL_DETAIL_SUFFIX = "/public-api/comparations/detail/?id=";
    let id = req.query.id;
    let baseUrl = req.query.url;
    let url = baseUrl;

    if(url && url.length){
        url += URL_DETAIL_SUFFIX + id;
        axios.get(url)
            .then(function (response){
                if (response.data && response.data.data && response.data.data.corruptionIndex) {
                    response.data.data.corruptionIndex.url = baseUrl;
                }
                return res.json(response.data)
            })
            .catch(error => {
                return res.json({error: true, message : "Ocurrió un error consultando la organización remota"})
            });

        return;
    }



    let qNotDeleted = deletedSchema.qNotDeleted();
    let organizationId = mongoose.Types.ObjectId(id);
    let qByOrganization = {"organization": organizationId};
    let query = {...qNotDeleted, ...qByOrganization};

    Contract.aggregate([
        {
            $match: query
        },
        {
            $group: {
                _id: null,

                publicCount: {
                    $sum: {
                        $cond: {
                            if: {$eq: ["$procedureType", "PUBLIC"]},
                            then: 1,
                            else: 0
                        }
                    }
                },
                invitationCount: {
                    $sum: {
                        $cond: {
                            if: {$eq: ["$procedureType", "INVITATION"]},
                            then: 1,
                            else: 0
                        }
                    }
                },
                noBidCount: {
                    $sum: {
                        $cond: {
                            if: {$eq: ["$procedureType", "NO_BID"]},
                            then: 1,
                            else: 0
                        }
                    }
                },
                totalCount: {$sum: 1},

                public: {
                    $sum: {
                        $cond: {
                            if: {$eq: ["$procedureType", "PUBLIC"]},
                            then: "$totalOrMaxAmount",
                            else: 0
                        }
                    }
                },
                invitation: {
                    $sum: {
                        $cond: {
                            if: {$eq: ["$procedureType", "INVITATION"]},
                            then: "$totalOrMaxAmount",
                            else: 0
                        }
                    }
                },
                noBid: {
                    $sum: {
                        $cond: {
                            if: {$eq: ["$procedureType", "NO_BID"]},
                            then: "$totalOrMaxAmount",
                            else: 0
                        }
                    }
                },
                total: {$sum: "$totalOrMaxAmount"}
            }
        },
        {
            $project: {
                publicCount: 1,
                invitationCount: 1,
                noBidCount: 1,
                totalCount: 1,

                public: 1,
                invitation: 1,
                noBid: 1,
                total: 1
            }
        }
    ]).exec((err, results) => {
        let result = results[0] || {};

        async.parallel({
            corruptionIndex: (callback) => {
                let query = {...qNotDeleted/*, ...qByOrganization*/, locked: true};
                Calculation
                    .findOne(query)
                    .lean()
                    .exec((err, corruptionIndex) => {

                        if (err) {
                            logger.error(err, req, 'publicComparation.controller#detail', 'Error trying to query corruption index');
                        }

                        corruptionIndex = corruptionIndex || {};

                        //Set default result
                        corruptionIndex.result = 0;
                        
                        //Set url
                        corruptionIndex.url = url;

                        if (!corruptionIndex._id) {
                            return callback(null, corruptionIndex);
                        }

                        let cache = {
                            done: [],
                            calls: [],
                            i: 0,
                            resultsMap: {},
                        };

                        let query = Calculation.qAdministrationPeriodFromYearToYear(corruptionIndex);

                        calculateAndValidateFormula(req, cache, corruptionIndex._id, {query: query, currentOrganizationId: organizationId}, (err, result) => {
                            if (err) {
                                logger.error(err, req, 'publicComparation.controller#detail', 'Error trying to get result for corruption index');
                            }
                            if (result && result.value) {
                                corruptionIndex.result = result.value;
                            }
                            return callback(null, corruptionIndex);
                        });

                    });
            },
            organization: (callback) => {
                let qById = {_id: id};
                let query = {...qById, ...qNotDeleted};
                Organization
                    .findOne(query)
                    .exec((err, organization) => {
                        return callback(null, organization);
                    });
            },
            calculationsInfo: (callback) => {
                let cache = {
                    done: [],
                    calls: [],
                    i: 0,
                    resultsMap: {},
                };

                Calculation.getEnabledCalculations(req, cache, id, (err, calculationsInfo) => {
                    if (err) {
                        logger.error(err, req, 'publicComparation.controller#detail', 'Error trying to get enabled calculations');
                    }
                    calculationsInfo = calculationsInfo || [];
                    
                    return callback(null, calculationsInfo);
                });
            },
        }, (err, results) => {
            let corruptionIndex = results.corruptionIndex;
            let organization = results.organization;
            let calculationsInfo = results.calculationsInfo;

            let total = result.total || 0;
            let publicCount = result.publicCount || 0;
            let invitationCount = result.invitationCount || 0;
            let noBidCount = result.noBidCount || 0;
            let totalCount = result.totalCount || 0;

            let detail = {
                organization: {
                    _id: organization._id.toString(),
                    name: organization.name,
                    shortName: organization.shortName,
                    color: organization.color,
                },
                corruptionIndex: corruptionIndex,
                calculationsInfo: calculationsInfo,
                totals: {
                    public: result.public || 0,
                    invitation: result.invitation || 0,
                    noBid: result.noBid || 0,

                    publicPercent: publicCount / totalCount,
                    invitationPercent: invitationCount / totalCount,
                    noBidPercent: noBidCount / totalCount,

                    total: total
                },
                counts: {
                    public: publicCount,
                    invitation: invitationCount,
                    noBid: noBidCount,
                    total: totalCount,
                }
            };

            return res.json({
                error: false,
                data: detail
            });

        });

    });
};



exports.saveComparation =  (req, res, next) => {
    getOrCreateComparation(req, function (err, result) {
        if(err){
            return res.json({error: true})
        }
        if(result.error){
            return res.json({errors: true, message: result.message})
        }

        let comparation = result.comparation;

        comparation.prepareComparationforSaving(function (error, result) {
            if(error){
                return res.json({
                    error: true,
                    err : error
                })
            } else if (result.error){
                console.log(result.message);
                return res.json({
                    error: true,
                    message : result.message
                })
            } else {
                if(result.mustSave){
                    comparation.save((err, comparationSaved) => {
                      if(err){
                          return res.json({
                              error: true,
                              err: err,
                              message : "Ocurrió un error al tratar de salvar la comparación"
                          })
                      } else {
                          return res.json({
                              error: false,
                              message : "Saved!"
                          })
                      }
                    });
                } else {
                    res.json(result)
                }
            }
        })
    })
};


let getOrCreateComparation = (req, callback) => {

    if (req.body._id) {
        Comparation.findOne({
            _id: req.body._id
        }, (err, response) => {
            if (err) {
                console.log("err", err);
                return callback(err)
            }
            // console.log("response data publicComparation.controller#getOrCreateComparation", response.data);
            if (response) {
                return callback(null, {error: false, comparation: response, message: "Found comparation"});
            }
        })
    } else {
        if (req.body && req.body.target) {
            Comparation.findOne({
                target: mongoose.Types.ObjectId(req.body.target),
                from: Organization.currentOrganizationId(req),
            }, (err, response) => {
                if (err) {
                    console.log("err", err);
                    return callback(err)
                }
                // console.log("response data publicComparation.controller#getOrCreateComparation", response.data);
                if (response) {
                    return callback(null, {error: false, comparation: response, message: "Found comparation"});
                } else {
                    let comparation = new Comparation({
                        target: mongoose.Types.ObjectId(req.body.target),
                        from: Organization.currentOrganizationId(req),
                        remoteUrl: req.body.url
                    });

                    return callback(null, {error: false, comparation: comparation})
                }
            })
        } else {
            return callback(true, {message: "Incomplete data"})
        }
    }
};


exports.retrieveRecentComparations =  (req, res, next) => {

    // console.log('Organization.currentOrganizationId(req) --> ' + Organization.currentOrganizationId(req));

    Comparation.find(
        {
            // from: Organization.currentOrganizationId(req)
        },
        (err, result) => {
        if(err){
            return res.json({
                "error": false,
                "message": "Se produjo un error intentando conseguir las comparaciones"
            });
        }

        return res.json({
            error : false,
            message : "Comparations retrieved correctly",
            data : result
        });
    })
};

exports.download = (req, res, next) => {
    let id = req.params.id;
    let format = req.params.format;


    if (!['xls', 'pdf', 'json'].includes(format)) {
        res.status(404);
        return res.end();
    }

    let qNotDeleted = deletedSchema.qNotDeleted();
    // let qByOrganization = {"organization": mongoose.Types.ObjectId(id)};
    
    Organization.findOne({_id: Organization.currentOrganizationId(req)})
        .exec((err, currentOrganization) => {
            if (err) {
                logger.error(err, req, 'publicComparation.controller#corruptionIndex', 'Error trying to find current Organization');
                
                return res.json({
                    error: true,
                    data: {}
                });
            }
            
            let query = {...qNotDeleted/*, ...qByOrganization*/, locked: true};
            Calculation
                .findOne(query)
                .populate('organization calculations')
                // .lean()
                .exec((err, corruptionIndex) => {
        
                    if (err) {
                        //Error
                        logger.error(err, req, 'publicComparation.controller#corruptionIndex', 'Error trying to find Corruption index');
                        return res.json({
                            error: true,
                            data: {}
                        });
                    } else if (!corruptionIndex) {
                        //Not found
                        logger.error(null, req, 'publicComparation.controller#corruptionIndex', 'Corruption index not found');
                        // return res.json({
                        //     error: true,
                        //     data: {}
                        // });
                    }
        
                    corruptionIndex = corruptionIndex || {};
                    
                    if (corruptionIndex.toObject) {
                        corruptionIndex = corruptionIndex.toObject();
                        corruptionIndex.organization = currentOrganization;
                    }
        
                    corruptionIndex.result = 0;
        
        
                    if (!corruptionIndex._id) {
                        return res.json({
                            error: true,
                            data: corruptionIndex
                        });
                    }
        
                    let cache = {
                        done: [],
                        calls: [],
                        i: 0,
                        resultsMap: {},
                    };

                    let query = Calculation.qAdministrationPeriodFromYearToYear(corruptionIndex);
        
                    calculateAndValidateFormula(req, cache, corruptionIndex._id, {query: query}, (err, result) => {
                        if (result && result.value) {
                            corruptionIndex.result = result.value;
                        }
        
                        if (corruptionIndex.result <= 55) {
                            corruptionIndex.corruptionLevel = 'BAJO'
                        } else if (corruptionIndex.result <= 75) {
                            corruptionIndex.corruptionLevel = 'MEDIO'
                        } else {
                            corruptionIndex.corruptionLevel = 'ALTO'
                        }
        
        
                        delete corruptionIndex._id;
                        switch(format){
                            case 'xls':
                                downloadXls(req, res, corruptionIndex);
                                break;
                            case 'pdf':
                                downloadPDF(req, res, corruptionIndex);
                                break;
                            case 'json':
                                return res.json({ corruptionIndex });
                                break;
                            default:
                                break;
                        }
                    });
        
                });
        });

};

function downloadXls(req, res, corruptionIndex){
    try {

        let excelInfo = {
            generalInfo:{
                docs : [corruptionIndex],
                sheetNumber: 1
            },
            corruptionInfo:{
                docs : [...corruptionIndex.formula.variables, ...corruptionIndex.formula.calculations],
                sheetNumber : 2
            }
        };
        new ExcelExporter()
            .setPropInfoArray([
                {
                    header: 'NOMBRE DEL CALCULO',
                    propName: 'name',
                    sheet:1
                },
                {
                    header: 'DESCRIPCIÓN DEL CALCULO',
                    propName: 'description',
                    sheet:1
                },
                {
                    header: 'ORGANIZACIÓN',
                    propName: 'organization',
                    childPropName:'name',
                    sheet:1
                },
                {
                    header: 'FORMULA',
                    propName: 'formula',
                    childPropName : 'expression',
                    sheet:1
                },
                {
                    header: 'RESULTADO',
                    propName: 'result',
                    sheet:1
                },
                {
                    header: 'PROBABILIDAD',
                    propName: 'corruptionLevel',
                    sheet:1
                },
                {
                    header: 'ABREVIACIÓN',
                    propName: 'abbreviation',
                    sheet:2
                },
                {
                    header: 'NOMBRE',
                    propName: 'name',
                    sheet:2
                },
                {
                    header: 'DESCRIPCIÓN',
                    propName: 'description',
                    sheet:2
                },
            ])
            .setDocs(corruptionIndex)
            .setTitle('Indice de corrupción')
            .setFileName('indice-corrupcion')
            .exportToFileExtraSheets(req, res, excelInfo);
    } catch(err){
        logger.error(err,req,"publicComparition.controller#downloadXls","Error intentando crear el archivo xls del índice de corrupción")
    }
};

let downloadPDF = (req, res, corruptionIndex) => {


    let generalInfoTable = {
        style: 'statsCurrency4Col',
        layout: 'lightHorizontalLines',
        table: new PDFTable({ headerRows:1, docs:corruptionIndex })
            .setTableMetadata([
                {
                    header: 'Nombre del Calculo',
                    headerStyle:'headerStyle',
                    rowStyle:'rowNumberStyle',
                    propName:'name'
                },
                {
                    header: 'Descripción del Calculo',
                    headerStyle:'headerStyle',
                    rowStyle:'rowNumberStyle',
                    propName:'description'
                },
                {
                    header: 'Organización',
                    headerStyle:'headerStyle',
                    rowStyle:'rowNumberStyle',
                    propName:'organization',
                    childPropName:'name'
                },
                {
                    header: 'Formula',
                    headerStyle:'headerStyle',
                    rowStyle:'rowNumberStyle',
                    propName:'formula',
                    childPropName:'expression'
                },
                {
                    header: 'Resultado',
                    headerStyle:'headerStyle',
                    rowStyle:'rowNumberStyle',
                    propName:'result'
                },
                {
                    header: 'Probabilidad',
                    headerStyle:'headerStyle',
                    rowStyle:'rowNumberStyle',
                    propName:'corruptionLevel'
                }
            ])
            .setHeaders()
            .setWidths(null,"auto")
            .transformDocs(req)
    };
    let variablesTable = {
        style:'table4Col',
        // layout: 'lightHorizontalLines',
        table:new PDFTable({headerRows:1,docs:[...corruptionIndex.formula.variables, ...corruptionIndex.formula.calculations]})
            .setTableMetadata([
                {
                    header: 'Abreviación',
                    headerStyle:'headerStyle',
                    rowStyle:'rowStyle',
                    propName:'abbreviation'
                },
                {
                    header: 'Nombre',
                    headerStyle:'headerStyle',
                    rowStyle:'rowCurrencyStyle',
                    propName:'name'
                },
                {
                    header: 'Descripción',
                    headerStyle:'headerStyle',
                    rowStyle:'rowCurrencyStyle',
                    propName:'description'
                }
            ])
            .setHeaders()
            .setWidths(null,"auto")
            .transformDocs(req)
    };

    let headers = [{ text:"Monitor Karewa", style:'header'},
        {text : moment(new Date()).format('MM/DD/YYYY'), style:'header'}];

    new PDFExporter()
        .setFileName('monitor-karewa-indice-corrupcion.pdf')
        .addHeadersToPDF(headers)
        .addTitleToPDF({text:"Índice de corrupción", style:'title'})
        .addContentToPDF(generalInfoTable)
        .addContentToPDF(variablesTable)
        .addFooterToPDF()
        .setPageOrientation('landscape')
        .exportToFile(req, res)
};