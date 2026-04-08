function readAllDocs() {
  var docs = [
    {id: '12QE1dRxIuja47zKVgMhHC0bxeC30ztyGk5koAfvKtdM', name: 'C1'},
    {id: '17EB11DvKGMUY7yaVEOrdkvyFChA_clvK8dZHir5dU1E', name: 'C5'},
    {id: '1Fi3OJZ1QUJ6b9LGE4v-P2GQ-dbMqXW4cu-r3Ds8nkRk', name: 'C2'},
    {id: '1qk2EN0O2hGfgsojh5XjpWMC65_Q_XXuls_9baPvDRO0', name: 'C4'},
    {id: '1msUH7QbK4kRu49NwUq0JoZquOBFtZqZXeAZZqUQM8NQ', name: 'C3'},
    {id: '1YalRtQ1kcoPHiFW-TznsQCD01fcMgSaPYmRNgz0-Tw8', name: 'C6'}
  ];
  for (var i = 0; i < docs.length; i++) {
    try {
      var doc = DocumentApp.openById(docs[i].id);
      var text = doc.getBody().getText();
      Logger.log('=== ' + docs[i].name + ' (' + doc.getName() + ') ===');
      Logger.log(text.substring(0, 500));
      Logger.log('...\n');
    } catch(e) {
      Logger.log(docs[i].name + ' ERROR: ' + e.message);
    }
  }
}
