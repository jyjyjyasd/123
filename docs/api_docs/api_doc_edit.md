# 编辑图像 - 适用于mix版本

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/edits:
    post:
      summary: 编辑图像 - 适用于mix版本
      deprecated: false
      description: 根据提示编辑现有图像
      operationId: createImageEdit
      tags:
        - 图片/视频生成/OpenAI image格式
        - Images
      parameters:
        - name: Authorization
          in: header
          description: ''
          example: Bearer {{key}}
          schema:
            type: string
            default: Bearer {{key}}
        - name: Content-Type
          in: header
          description: ''
          example: application/json
          schema:
            type: string
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                image:
                  type: string
                  format: binary
                  example: ''
                prompt:
                  type: string
                  example: 把图片改为吉卜力风格
                model:
                  type: string
                  example: mix/gpt-image-2
                'n':
                  type: integer
                  example: 1
                size:
                  type: string
                  enum:
                    - 1024x1024
                    - 1536x1024
                    - 1024x1536
                    - auto
                  x-apifox-enum:
                    - value: 1024x1024
                      name: ''
                      description: ''
                    - value: 1536x1024
                      name: ''
                      description: ''
                    - value: 1024x1536
                      name: ''
                      description: ''
                    - value: auto
                      name: ''
                      description: ''
                  default: 1024x1024
                  example: 1024x1024
              required:
                - image
                - prompt
            examples: {}
      responses:
        '200':
          description: 成功编辑图像
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImageResponse'
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 图片/视频生成/OpenAI image格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/7484222/apis/api-383889371-run
components:
  schemas:
    ImageResponse:
      type: object
      properties:
        created:
          type: integer
        data:
          type: array
          items:
            type: object
            properties:
              url:
                type: string
              b64_json:
                type: string
              revised_prompt:
                type: string
            x-apifox-orders:
              - url
              - b64_json
              - revised_prompt
            x-apifox-ignore-properties: []
      x-apifox-orders:
        - created
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
  securitySchemes: {}
servers:
  - url: '{{url}}'
    description: 正式环境
security: []

```
