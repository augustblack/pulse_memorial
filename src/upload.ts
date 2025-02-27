import type { Context } from 'hono'
import { EmailMessage } from "cloudflare:email"
import { createMimeMessage } from 'mimetext'

export const sendEmail = (c: Context, key: string | null) => {
  const msg = createMimeMessage()
  msg.setSender({ name: "Pulse Memorial", addr: "brook@pulse.memorial" })
  msg.setRecipient('augustblack@gmail.com')
  msg.setSubject("New Pulse Memorial File: " + key)
  // @ts-ignore
  msg.addMessage({
    contentType: 'text/html',
    data: `There is a new uploaded file for the Pulse Memorial: <a href="https://assets.pulse.memorial/${key}">https://assets.pulse.memorial/${key}</a>`
  })

  var message = new EmailMessage(
    "brook@pulse.memorial",
    "augustblack@gmail.com",
    msg.asRaw()
  )
  return c.env.BROOK_EMAIL.send(message)
}

export const handleUpload = async (c: Context) => {
  const bucket = c.env.MY_BUCKET

  const url = new URL(c.req.url)
  const key = url.searchParams.get('key')
  const action = url.searchParams.get("action")

  if (action === null) {
    return new Response("Missing action type", { status: 400 })
  }

  // Route the request based on the HTTP method and action type
  switch (c.req.method) {
    case "POST":
      switch (action) {
        case "mpu-create": {
          const multipartUpload = await bucket.createMultipartUpload(key)
          console.log('create', multipartUpload)
          return Response.json({
            key: multipartUpload.key,
            uploadId: multipartUpload.uploadId
          })
        }
        case "mpu-complete": {
          const uploadId = url.searchParams.get("uploadId")
          if (uploadId === null) {
            return new Response("Missing uploadId", { status: 400 })
          }

          const multipartUpload = c.env.MY_BUCKET.resumeMultipartUpload(
            key,
            uploadId
          )

          interface completeBody {
            parts: R2UploadedPart[]
          }
          const completeBody: completeBody = await c.req.json()
          if (completeBody === null) {
            return new Response("Missing or incomplete body", {
              status: 400,
            })
          }

          // Error handling in case the multipart upload does not exist anymore
          try {
            const obj = await multipartUpload.complete(completeBody.parts)
            await sendEmail(c, key)
            return new Response(null, {
              headers: {
                etag: obj.httpEtag,
              },
            })
          } catch (error: any) {
            console.log(error.message)
            return new Response(error.message, { status: 400 })
          }
        }
        default:
          return new Response(`Unknown action ${action} for POST`, {
            status: 400,
          })
      }
    case "PUT":
      switch (action) {
        case "mpu-uploadpart": {
          const uploadId = url.searchParams.get("uploadId")
          const partNumberString = url.searchParams.get("partNumber")
          /*
           // for testing retry
          if (Math.random() > 0.8) {
            return new Response("Randomly rejected", {
              status: 400,
            })
          }
          */

          if (partNumberString === null || uploadId === null) {
            return new Response("Missing partNumber or uploadId", {
              status: 400,
            })
          }

          const partNumber = parseInt(partNumberString)
          const multipartUpload = c.env.MY_BUCKET.resumeMultipartUpload(
            key,
            uploadId
          )
          try {
            const formData = await c.req.formData()
            const body = formData.get('file')
            const uploadedPart: R2UploadedPart = await multipartUpload.uploadPart(partNumber, body)
            return Response.json(uploadedPart)
          } catch (error: any) {
            return new Response(error.message, { status: 400 })
          }
        }
        default:
          return new Response(`Unknown action ${action} for PUT`, {
            status: 400,
          })
      }
    case "GET":
      if (action === "list") {
        const options = {
          limit: 500,
          include: ["customMetadata"],
        }

        const listed = await c.env.MY_BUCKET.list(options)

        let truncated = listed.truncated
        let cursor = truncated ? listed.cursor : undefined

        while (truncated) {
          const next = await c.env.MY_BUCKET.list({
            ...options,
            cursor: cursor,
          })
          listed.objects.push(...next.objects)

          truncated = next.truncated
          cursor = next.cursor
        }
        return Response.json(listed.objects)
      }
      if (action !== "get") {
        return new Response(`Unknown action ${action} for GET`, {
          status: 400,
        })
      }
      const object = await c.env.MY_BUCKET.get(key)
      if (object === null) {
        return new Response("Object Not Found", { status: 404 })
      }
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set("etag", object.httpEtag)
      return new Response(object.body, { headers })
    case "DELETE":
      switch (action) {
        case "mpu-abort": {
          const uploadId = url.searchParams.get("uploadId")
          if (uploadId === null) {
            return new Response("Missing uploadId", { status: 400 })
          }
          const multipartUpload = c.env.MY_BUCKET.resumeMultipartUpload(
            key,
            uploadId
          )

          try {
            multipartUpload.abort()
          } catch (error: any) {
            return new Response(error.message, { status: 400 })
          }
          return new Response(null, { status: 204 })
        }
        case "delete": {
          await c.env.MY_BUCKET.delete(key)
          return new Response(null, { status: 204 })
        }
        default:
          return new Response(`Unknown action ${action} for DELETE`, {
            status: 400,
          });
      }
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "PUT, POST, GET, DELETE" },
      });
  }
}
