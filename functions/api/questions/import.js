export default {

  async fetch(request, env) {

    console.log('API called:', request.method, request.url);

    // CORS ヘッダー
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // OPTIONS リクエスト（プリフライト）を処理
    if (request.method === 'OPTIONS') {
      console.log('OPTIONS request handled');
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // POSTのみ許可
    if (request.method !== "POST") {
      console.log('Method not allowed:', request.method);
      return new Response(
        "Method Not Allowed",
        {
          status: 405,
          headers: corsHeaders,
        }
      );

    }

    console.log('Processing POST request');

    // JSON取得
    const body = await request.json();
    console.log('Body:', body);

    // Supabase接続情報
    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('Supabase credentials not configured');
      return Response.json({
        success: false,
        error: 'Supabase not configured'
      }, {
        status: 500,
        headers: corsHeaders,
      });
    }

    try {

      // 問題を登録
      const questionRes = await fetch(
        `${SUPABASE_URL}/rest/v1/questions`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            exam_id: body.exam_id,
            category: body.category,
            question: body.question,
            explanation: ''
          })
        }
      );

      if (!questionRes.ok) {
        const errorText = await questionRes.text();
        console.error('Question insert error:', errorText);
        throw new Error(`Failed to insert question: ${questionRes.status}`);
      }

      const questionData = await questionRes.json();
      const questionId = questionData[0]?.id;

      console.log('Question inserted, ID:', questionId);

      // 選択肢を登録
      for (const choice of body.choices) {
        const choiceRes = await fetch(
          `${SUPABASE_URL}/rest/v1/choices`,
          {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              question_id: questionId,
              choice_index: choice.choice_index,
              content: choice.content,
              is_correct: choice.is_correct
            })
          }
        );

        if (!choiceRes.ok) {
          console.error('Choice insert error:', choiceRes.status);
          throw new Error(`Failed to insert choice`);
        }

        console.log('Choice inserted:', choice.choice_index);
      }

      console.log('All data inserted successfully');

      // OK
      return Response.json({
        success: true,
        questionId
      }, {
        headers: corsHeaders,
      });

    } catch (error) {

      console.error('Database error:', error);

      return Response.json({
        success: false,
        error: error.message
      }, {
        status: 500,
        headers: corsHeaders,
      });

    }

  }

};