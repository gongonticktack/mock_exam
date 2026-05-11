export default {

  async fetch(request, env) {

    // POSTのみ許可
    if (request.method !== "POST") {

      return new Response(
        "Method Not Allowed",
        {
          status: 405
        }
      );

    }

    // JSON取得
    const body =
      await request.json();

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

    // question_id取得
    const questionId =
      result.meta.last_row_id;

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

    }

    // OK
    return Response.json({

      success: true,

      questionId

    });

  }

};