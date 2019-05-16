const Excel = require('exceljs');
const moment = require('moment');

class Exporter {
    constructor() {
        this.fileName = 'informacion-monitor-karewa';
        this.title = '';
        this.docNameSingular = 'Registro';
        this.docNamePlural = 'Registros';
        this.date = new Date();
    }
    
    setFileName(fileName) {
        this.fileName = fileName;
        return this;
    }
    
    setTitle(title) {
        this.title = title;
        return this;
    }
    
    setDocName(singular, plural) {
        this.title = title;
        return this;
    }

    getParams() {
        return {
            title: this.title,
            date: this.date,
            docNameSingular: this.docNameSingular,
            docNamePlural: this.docNamePlural,
        }
    }
}

class ExcelExporter extends Exporter {
    constructor(test) {
        super(test);
        
        this.propInfoArray = [];
        this.docs = [];
        
        this.rowIndexes = {
            INFO: 1,
            HEADERS: 2,
            CONTENT_START: 2
        }
    }
    
    getParams() {
        return {
            ...super.getParams(),
            propInfoArray: this.propInfoArray,
            docs: this.docs,
            fileName: this.fileName
        }
    }
    
    setPropInfoArray(propInfoArray) {
        this.propInfoArray = propInfoArray;
        return this;
    }
    
    setDocs(docs) {
        this.docs = docs;
        return this;
    }
    
    exportToFile(req, res) {
        let params = this.getParams();

        let workbook = new Excel.Workbook();
        let sheet = workbook.addWorksheet(params.docNamePlural);

        let formattedDate = moment(params.date).format('MM/DD/YYYY');
        
        sheet.getRow(this.rowIndexes.INFO).getCell(1).value = params.title;
        sheet.getRow(this.rowIndexes.INFO).getCell(2).value = `Fecha de consulta: ${formattedDate}`;
        sheet.getRow(this.rowIndexes.INFO).getCell(3).value = `Consultado en Monitor Karewa`;
        
        let cellIndexByHeader = {};
        let cellIndexByPropName = {};
        let formatByPropName = {};


        params.propInfoArray.forEach((propInfo, index) => {
            let cellIndex = index + 1; //base 1
            
            sheet.getRow(this.rowIndexes.HEADERS).getCell(cellIndex).value = propInfo.header;

            cellIndexByHeader[propInfo.header] = cellIndex;
            cellIndexByPropName[propInfo.propName] = cellIndex;
            formatByPropName[propInfo.propName] = propInfo.format;
        });
        
        params.docs.forEach((doc, index) => {
            let rowIndex = this.rowIndexes.CONTENT_START + index + 1; //base 1, offset from content start
            
            let propNames = Object.keys(doc);

            propNames.forEach((propName) => {
                let cellIndex = cellIndexByPropName[propName];
    
                if (cellIndex) {

                    let format = formatByPropName[propName] || 'string';
                    
                    switch(format) {
                        case 'currency':
                            sheet.getRow(rowIndex).getCell(cellIndex).numFmt = '"$"#,##0.00;[Red]\-"$"#,##0.00';
                            sheet.getRow(rowIndex).getCell(cellIndex).value = doc[propName];
                            break;
                        case 'string':
                        default:
                            sheet.getRow(rowIndex).getCell(cellIndex).value = doc[propName];
                    }
                }
            });
            
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats');
        res.setHeader("Content-Disposition", "attachment; filename=" + `${params.fileName}-${formattedDate}.xlsx`);

        workbook.xlsx.write(res)
            .then(function(){
                res.end();
            });
        
    }
}

module.exports = {
    ExcelExporter,
    Exporter
};