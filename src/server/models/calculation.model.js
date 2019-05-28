const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { check, validationResult } = require('express-validator/check');
const Contracts = require("./contract.model").Contract;

const pluginCreatedUpdated = require('mongoose-createdat-updatedat');
const mongoosePagination = require('mongoose-paginate');
const math = require('mathjs');

const permissions = require('./../components/permissions');
const utils = require('./../components/utils');

const typeEnumDict = {
    'GENERAL': [
        {
            regexStr: utils.toAccentsRegex('general(es)?', null, true),
            flags: 'gi'
        },
    ],
    'CONTRACT': [
        {
            regexStr: utils.toAccentsRegex('contrat(os|o)', null, true),
            flags: 'gi'
        },
    ],
};

const typeEnum = Object.keys(typeEnumDict);

const displayFormEnumDict = {
    'NORMAL': [
        {
            regexStr: utils.toAccentsRegex('normal(es)?', null, true),
            flags: 'gi'
        },
    ],
    'PERCENTAGE': [
        {
            regexStr: utils.toAccentsRegex('(porcentaje|porcentual)', null, true),
            flags: 'gi'
        },
    ],
    'AMOUNT': [
        {
            regexStr: utils.toAccentsRegex('(cantidad|numero)', null, true),
            flags: 'gi'
        },
    ],
};


const propertiesEnum = ['totalAmount','minAmount','maxAmount','totalOrMaxAmount','supplier','organizerAdministrativeUnit','applicantAdministrativeUnit']
const operatorEnum = ['EQUAL','GREATER','GREATER_EQUAL','LESS','LESS_EQUAL','NOT_EQUAL'];
const typesEnum = ['REF','STRING','NUMBER'];
const variablesEnum =  ["$MTG", "$MGLP", "$MGAD", "$MGIR", "$NTC", "$NCSF", "$MADEM", "$MTAD", "$NTP", "$NPEPE", "$NP80E", "$NPEPCP", "$NCDPT", "$NIDPT", "$NCPJA", "$NFXXVII"];


const displayFormEnum = Object.keys(displayFormEnumDict);


const variableSchema = new Schema({
    abbreviation: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String
        // required: true
    }
    //TODO: definir campos faltantes
});


/**
 * Schema de Mongoose para el modelo Calculation.
 * @type {mongoose.Schema}
 */
let CalculationSchema = new Schema({});

const ScaleSchema = new Schema({
   min:{
       type: Number,
       min:[0,"El valor mínimo para el campo Min(%) es 0"],
       max:[99,"El valor máximo para el campo Max(%) es 99"],
       validate:{
           validator: function () {
               return this.min < this.max
           },
           message: props => "El valor mínimo de la escala no puede ser mayor al valor máximo"
       }
   },
   max:{
       type: Number,
       min:[1, "El valor mínimo para el campo Max(%) es 1"],
       max:[100, "El valor máximo para el campo Max(%) es 100"]
   },
   value:{
       type: Number
   }
});

const FormulaSchema = new Schema({
    locked: {
        type: Boolean,
        required: true,
        default: false
    },
    expression: {
        type: String,
        required: true
    },
    variables: [variableSchema],
    calculations :  {
        type: [Schema.Types.ObjectId],
        ref : 'Calculation'
    }
});

const FilterSchema = new Schema({
    variableAbbreviation:{
        type:String,
        enum:variablesEnum,
        required:[true, 'No se asigno la abreviación de la variable al filtro']
    },
    propertyName:{
        type:String,
        enum:propertiesEnum,
        required:[true, 'No se agrego la propiedad al filtro']
    },
    propertyType:{
        type:String,
        enum:typesEnum,
        required:[true, 'El filtro no cuenta con tipo de propiedad']
    }, //Add validator for every type of filter (normalProperty, references)
    operator:{
        type:String,
        required:[true, 'No se agrego el operador al filtro'],
        default:'EQUAL',
        enum:operatorEnum
    },
    onModel:{
        type:String,
        required:function () {
            return this.propertyType == 'REF'
        }
    },
    reference:{
        type: Schema.Types.ObjectId,
        refPath:'onModel',
        required:[ function(){
            return this.propertyType == 'REF'
        }, 'No se selecciono la opción del filtro']
    },
    value:{
        type:String,
        required:[function(){
            return this.propertyType !== 'REF'
        }, 'No se selecciono el valor del filtro']
    }
});

CalculationSchema.add({
        organization: {
            type: Schema.Types.ObjectId,
            ref: 'Organization',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        description : {
            type: String,
            required: true
        },
        abbreviation: {
            type: String,
            required: true,
            min: 2,
            max: 8
        },
        type : {

            type: String,
            required: true,
            enum: typeEnum
        },
        enabled :  {

            type: Boolean,
            required: false
        },
        displayForm :  {
            type: String,
            required: true,
            enum: displayFormEnum
        },
        notes : {
            type: String,
            required: false
        },
        formula: {
            type: FormulaSchema,
            required: false
        },
        hasPercentScale : {
            type : Boolean,
            required : true,
            default : false
        },
        scale:[ScaleSchema],
        filters:[FilterSchema]

    }
);
    CalculationSchema.delete = require("./schemas/deleted.schema").Deleted;

//Agregar createdAt, modifiedAt automáticamente
CalculationSchema.plugin(pluginCreatedUpdated);

//Paginación
CalculationSchema.plugin(mongoosePagination);

//Clase del modelo Calculation.
class CalculationClass {
    constructor() {

    }

    validateFormula() {
        console.log("formula", this.formula);
        try {
            if (this.formula && this.formula.expression) {
                let regex = "\\${1,2}[A-Z0-9]+";
                let newExpression = this.constructor.replaceVariableForValue(regex, this.formula.expression, "1");
                let value = math.eval(newExpression);
                return  {error: false, isValid: true};
            } else {
                return { error: true, isValid: false}
            }

        } catch (err) {
            return {error: true, isValid: false, err: err};
        }
    }

    //mirrored function on calculation controller
    static replaceVariableForValue(regex, expression, value){
        let newExpression = expression.replace(new RegExp(regex,"g"), value);
        return newExpression;
    }

}

//Cargar class en Schema
CalculationSchema.loadClass(CalculationClass);

//Indexes
CalculationSchema.index({name: 1, organization: 1, deleted: 1}, {unique: true});
CalculationSchema.index({abbreviation: 1, organization: 1, deleted: 1}, {unique: true});

CalculationSchema.statics.permission = permissions.getDefault("Calculation");

CalculationSchema.statics.expressValidator = function() {

    //For a list of available validators, check:
    //https://github.com/chriso/validator.js#validators

    //For more information about express-validator:
    //https://express-validator.github.io/docs/

    return [
        //Some examples:
        // check('email').isEmail(),
        // check('type').isIn(allowedTypes),
        // check('url').isUrl()
    ]
};

const Calculation = mongoose.model('Calculation', CalculationSchema);

module.exports = {
    Calculation,

    typeEnum,
    typeEnumDict,

    displayFormEnum,
    displayFormEnumDict
};