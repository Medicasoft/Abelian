var XLSX = require('xlsx');
var workbook = XLSX.readFile('direct.xlsx');
var FIRST_ROW = 4

function processWorksheet(worksheet) {

    var jsonValues = [];
    var found = true;
    for (x = FIRST_ROW; found; x++) {

        // first column is org name
        // fourth column is destination address
        var aCell = worksheet['A'+x];
        var dCell = worksheet['D'+x];
        if(aCell && aCell.v && dCell && dCell.v) {

            var company = aCell.v;
            var directEmails = homogenizeDirectAddressFromCrappyManuallyEnteredCellValue(dCell.v);

            for(idx in directEmails) {

                var email = directEmails[idx];
                if(email.indexOf('@') > 0) {

                    jsonValues.push({
                        "organizationName": company,
                        "destinationEmailAddress": directEmails[idx]
                    });
                }
            }
        } else {

            found = false;
        }
    }

    return jsonValues;
}

function homogenizeDirectAddressFromCrappyManuallyEnteredCellValue(cellVal) {

    var ary = cellVal.split(/[ ,]+/); // default split on whitespace
    var rslt = [];
    for(idx in ary) {
        var val = ary[idx];
        if(val.startsWith('(') || val === '') {
            break;
        }

        if(val.indexOf('\r\n') > 0) {

            var rnVals = val.split('\r\n');
            for (var vdx in rnVals) {

                rslt.push(rnVals[vdx]);
            }
        } else {

            rslt.push(val);    
        }
    }
    return rslt;
}

var jsonValues = [];

for(key in workbook.Sheets) {

    if(key.toLowerCase().indexOf('directory')) {

        var rslt = processWorksheet(workbook.Sheets[key]);
        if(rslt.length > 0) {

            jsonValues = jsonValues.concat(rslt);
        }
    }
}

console.log(JSON.stringify(jsonValues, null, 2));


