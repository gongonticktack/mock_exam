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
    const body =
      await request.json();

    console.log('Body:', body);

    try {

      // question登録
      const result =
        await env.examDB
          .prepare(`
            INSERT INTO questions
            (
              exam_id,
              category,
              question,
              explanation
            )
            VALUES (?, ?, ?, ?)
          `)
          .bind(
            body.exam_id,
            body.category,
            body.question,
            ""
          )
          .run();

      console.log('Question inserted, result:', result);

      // question_id取得
      const questionId =
        result.meta.last_row_id;

      console.log('Question ID:', questionId);

      // choices登録
      for (const choice of body.choices) {

        await env.examDB
          .prepare(`
            INSERT INTO choices
            (
              question_id,
              choice_index,
              content,
              is_correct
            )
            VALUES (?, ?, ?, ?)
          `)
          .bind(
            questionId,
            choice.choice_index,
            choice.content,
            choice.is_correct
          )
          .run();

        console.log('Choice inserted:', choice);

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