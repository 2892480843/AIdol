"""Regression coverage for non-streaming completions wrapped in SSE by gateways."""
import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.ai_service import AIService


@pytest.mark.parametrize('path', ['text', 'vision'])
@pytest.mark.parametrize('envelope', ['json', 'sse', 'sse_done'])
@pytest.mark.asyncio
async def test_non_streaming_completion_accepts_gateway_envelope(path, envelope):
    payload = {'choices': [{'message': {'role': 'assistant', 'content': 'OK'}, 'finish_reason': 'stop'}]}
    body = json.dumps(payload)
    content_type = 'application/json'
    if envelope != 'json':
        body = ': keepalive\n\ndata: ' + body + '\n\n'
        if envelope == 'sse_done':
            body += 'data: [DONE]\n\n'
        content_type = 'text/event-stream;charset=UTF-8'
    response = httpx.Response(200, text=body, headers={'content-type': content_type},
                              request=httpx.Request('POST', 'http://ai-endpoint.test/v1/chat/completions'))
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.post.return_value = response
    with patch('app.services.ai_service.httpx.AsyncClient', return_value=client):
        ai = AIService()
        if path == 'text':
            content = await ai.generate_text('hello')
        else:
            content, error, _ = await ai._call_with_fallback([{'role': 'user', 'content': 'hello'}], 'tags')
            assert error is None
        assert content == 'OK'


@pytest.mark.parametrize('body', [
    'data: {"choices":[{"delta":{"content":"part"}}]}\n\n',
    'data: {"choices":[{"message":{"content":"one"}}]}\n\ndata: {"choices":[{"message":{"content":"two"}}]}\n\n',
    'data: [DONE]\n\n',
    'data: not-json\n\n',
])
def test_incomplete_or_malformed_sse_is_rejected(body):
    from app.services.ai_service import _completion_response_json
    response = httpx.Response(200, text=body, headers={'content-type': 'text/event-stream'})
    with pytest.raises(ValueError):
        _completion_response_json(response)


def test_sse_error_is_preserved_for_existing_retry_logic():
    from app.services.ai_service import _completion_response_json
    payload = {'error': {'message': 'unsupported parameter: logprobs'}}
    response = httpx.Response(200, text='data: ' + json.dumps(payload) + '\n\n',
                              headers={'content-type': 'text/event-stream'})
    assert _completion_response_json(response) == payload


@pytest.mark.parametrize('locale,language',[('zh-CN','Simplified Chinese'),('en','English'),('unknown','English')])
@pytest.mark.asyncio
async def test_generated_prose_follows_user_locale_without_changing_json_contract(locale,language):
    response=httpx.Response(200,json={'choices':[{'message':{'content':'{"headline":"示例"}'},'finish_reason':'stop'}]},request=httpx.Request('POST','http://ai-endpoint.test/v1/chat/completions'))
    client=AsyncMock();client.__aenter__.return_value=client;client.post.return_value=response
    with patch('app.services.ai_service.httpx.AsyncClient',return_value=client):
        result=await AIService().generate_text('Return outfit JSON',locale=locale)
    messages=client.post.call_args.kwargs['json']['messages']
    assert messages[0]['role']=='system'
    assert language in messages[0]['content']
    assert 'JSON keys' in messages[0]['content']
    assert messages[-1]['content'].startswith('Return outfit JSON')
    assert language in messages[-1]['content']
    assert result=='{"headline":"示例"}'
