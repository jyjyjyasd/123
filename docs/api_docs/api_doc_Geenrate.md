# 生成图像

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/generations:
    post:
      summary: 生成图像
      deprecated: false
      description: 根据文本提示生成图像
      operationId: createImage
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
          application/json:
            schema:
              $ref: '#/components/schemas/ImageGenerationRequest'
            examples: {}
      responses:
        '200':
          description: 成功生成图像
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImageResponse'
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 图片/视频生成/OpenAI image格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/7484222/apis/api-383889370-run
components:
  schemas:
    ImageGenerationRequest:
      type: object
      required:
        - prompt
      properties:
        model:
          type: string
          examples:
            - gpt-image-2
        prompt:
          type: string
          description: 图像描述
          examples:
            - 会飞的小白兔
        'n':
          type: integer
          minimum: 1
          maximum: 10
          default: 1
        size:
          type: string
          enum:
            - 256x256
            - 512x512
            - 1024x1024
            - 1792x1024
            - 1024x1792
          default: 1024x1024
        quality:
          type: string
          enum:
            - low
            - medium
            - high
            - auto
          default: low
          x-apifox-enum:
            - value: low
              name: ''
              description: ''
            - value: medium
              name: ''
              description: ''
            - value: high
              name: ''
              description: ''
            - value: auto
              name: ''
              description: ''
        user:
          type: string
      x-apifox-orders:
        - model
        - prompt
        - 'n'
        - size
        - quality
        - user
      x-apifox-ignore-properties: []
      x-apifox-folder: ''
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
