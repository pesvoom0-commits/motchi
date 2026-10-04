"""Replace TEST persistence only; checked anchors preserve all other GAS functions."""
def separate_test_qa_log(gas,helper):
    start=gas.index('function appendTestQaDiagnostics_(body) {')
    end=gas.index('\nfunction readTestQaResult_',start)
    assert gas[end:].count('function readTestQaResult_')==1
    # These two helpers are the final appended section, built by temporal.gs.
    assert gas[end:].strip().endswith('return null;\n}')
    return gas[:start]+helper+'\n'
