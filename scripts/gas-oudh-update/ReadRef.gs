function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'update';
  var result = {};

  if (action === 'update') {
    try {
      var r = updateAllScripts();
      result.status = 'success';
      result.results = r;
    } catch(err) {
      result.status = 'error';
      result.error = err.message;
    }
  }

  if (action === 'read_skinq') {
    try {
      var doc = DocumentApp.openById('1lNxhAc1ZjJs_VErP8ocPrn9BrZcfIsEYWzq3Okeq2As');
      result.skinq = doc.getBody().getText();
    } catch(err) {
      result.skinq_error = err.message;
    }
  }

  if (action === 'fix_spelling') {
    try {
      result.fix = fixOudSpelling();
      result.status = 'success';
    } catch(err) {
      result.status = 'error';
      result.error = err.message;
    }
  }

  if (action === 'read_oudh') {
    try {
      var doc = DocumentApp.openById('12QE1dRxIuja47zKVgMhHC0bxeC30ztyGk5koAfvKtdM');
      result.oudh = doc.getBody().getText();
    } catch(err) {
      result.oudh_error = err.message;
    }
  }

  return ContentService.createTextOutput(JSON.stringify(result, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}
