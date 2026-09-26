(()=>{
  'use strict';

  /*
    v2 TEST-only Minimum Answerability Gate
    ----------------------------------------
    - /test/ の現行画面だけで動く。
    - 本番 /api/ask には触れない。
    - /test/archive/v1/ からは読み込まれない。
    - 会話履歴キーは一切変更・削除しない。
    - 明らかに情報不足な入力だけ、API呼び出し前に自然な確認を返す。
    - 直前文脈で補える短文（「詳しく」「続けて」「2つ目」等）はそのままAPIへ通す。
  */

  const nativeFetch=window.fetch.bind(window);
  const TEST_ASK_PATH='/api/test/ask';

  function clean(value){
    return String(value??'').replace(/\s+/g,' ').trim();
  }

  function normalize(value){
    return clean(value)
      .replace(/[!！?？。．…〜～]+$/g,'')
      .trim();
  }

  function isDefaultAssistant(text){
    const t=normalize(text);
    return !t || t==='美砂さん、なんでも聞いてください';
  }

  function hasUsableContext(conversation){
    if(!Array.isArray(conversation)||!conversation.length)return false;

    const meaningful=conversation.filter(item=>{
      const role=String(item?.role||'');
      const text=clean(item?.text||'');
      if(!text)return false;
      if(role==='assistant'&&isDefaultAssistant(text))return false;
      return role==='user'||role==='assistant';
    });

    // 直前に実質的な発話が1つでもあれば、
    // 「それ」「詳しく」「なんで？」などは文脈から解決できる可能性を優先する。
    return meaningful.length>0;
  }

  function looksLikeGreetingOrReaction(q){
    return /^(こんにちは|こんばんは|おはよう|はろー|ハロー|やほ|やっほ|ほい|うん|うんうん|おっけ|ok|ありがとう|ありがと|草|www+|笑|しゅきー?|すきー?)$/i.test(q);
  }

  function naturalClarification(question,conversation){
    const raw=clean(question);
    const q=normalize(raw);
    if(!q||looksLikeGreetingOrReaction(q))return null;

    // 文脈がある場合は、短い追質問でもまず弟子/Luna/Terraに解釈させる。
    // 「それ詳しく」「続けて」「1つ目」「もう一段」等を止めない。
    if(hasUsableContext(conversation))return null;

    // 参照先がない指示語。
    if(/^(それ|あれ|これ)(について|のこと|って|は)?(詳しく|もっと|教えて|どう思う|どう思ってる)?$/.test(q)){
      return 'どの話のことか、もうちょいだけ教えて？';
    }

    // 文脈なしの深掘り指示。
    if(/^(詳しく|もっと詳しく|もう少し詳しく|もう一段|もう一段詳しく|続けて|つづけて|次|次いって|その続き|続きを|続きを教えて)$/.test(q)){
      return 'ん、どの話の続きが聞きたい？';
    }

    if(/^(1|１|一|2|２|二|3|３|三|4|４|四|5|５|五)(つ目|個目|番目)(詳しく|から|も)?$/.test(q)){
      return 'どの並びの話かだけ、ちょい教えて？';
    }

    // 「最近どう？」だけだと検索対象が決まらない。
    if(/^(最近|最近どう|最近どうなん|最近どうなの|最近はどう|最近なんかある|最近なんかあった)$/.test(q)){
      return 'ん、もっちが最近AIに何を話してるかってこと？';
    }

    // 誰の・何についての認識なのかが抜けている。
    if(/^(どう思う|どう思ってる|どう見える|どう感じる|どうなん|どうなの)$/.test(q)){
      return '何についての「どう思う？」が知りたい？';
    }

    // 洋輔という対象だけあって、対象物がない。
    if(/^(もっち|洋輔さん|洋輔|彼)(は|って)?(どう思う|どう思ってる|どう見える|どうなん|どうなの)$/.test(q)){
      return '美砂さんのことをどう思ってるか、ってこと？';
    }

    // 原因だけ聞かれていて参照対象がない。
    if(/^(なんで|なぜ|どうして)$/.test(q)){
      return 'ん、何についての「なんで？」？';
    }

    // 「どんな感じ？」単独も対象不足。
    if(/^(どんな感じ|どんなかんじ|どんな感じなの|どんな感じなん)$/.test(q)){
      return '何の「どんな感じ？」が知りたい？';
    }

    return null;
  }

  function localCompletedResponse(answer,question){
    const body={
      state:'completed',
      answer,
      testDiagnostic:[
        'v2 TEST Minimum Answerability Gate',
        '判定: 回答前に確認が必要',
        `入力: ${clean(question)}`,
        'API/モデル呼び出し: なし',
        '本番利用回数: 消費なし'
      ].join('\n')
    };
    return new Response(JSON.stringify(body),{
      status:200,
      headers:{'Content-Type':'application/json; charset=utf-8'}
    });
  }

  window.fetch=async function(input,init){
    let url='';
    try{
      url=typeof input==='string'?input:String(input?.url||'');
      const method=String(init?.method||'GET').toUpperCase();

      if(method==='POST'&&url.includes(TEST_ASK_PATH)&&typeof init?.body==='string'){
        const payload=JSON.parse(init.body);
        const clarification=naturalClarification(payload?.question,payload?.conversation);

        if(clarification){
          return localCompletedResponse(clarification,payload?.question);
        }
      }
    }catch(_){
      // Gate側の判定失敗で通常通信まで壊さない。
    }

    return nativeFetch(input,init);
  };
})();
