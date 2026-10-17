from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
import httpx
import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize('target,trusted',[('https://gateway.test/v1',True),('https://another.test/v1',False)])
async def test_probe_supports_openai_models_and_scopes_server_key(client,test_user,auth_headers,target,trusted):
    response=httpx.Response(200,json={'data':[{'id':'Qwen3.8-max'},{'id':'Deepseek-v4.1-flash'}]},request=httpx.Request('GET',target+'/models'))
    upstream=AsyncMock();upstream.__aenter__.return_value=upstream;upstream.get.return_value=response
    settings=SimpleNamespace(ai_base_url='https://gateway.test/v1',ai_api_key='test-secret',ai_vision_model='Qwen3.8-max',ai_text_model='Deepseek-v4.1-flash')
    with patch('app.api.preferences.httpx.AsyncClient',return_value=upstream),patch('app.api.preferences.get_settings',return_value=settings,create=True):
        r=await client.post('/api/v1/users/me/preferences/test-ai-endpoint',headers=auth_headers,json={'url':target})
    assert r.json()['status']=='connected'
    assert r.json()['available_models']==['Qwen3.8-max','Deepseek-v4.1-flash']
    args,kw=upstream.get.call_args_list[0]
    assert args[0]==target+'/models'
    assert (kw.get('headers',{}).get('Authorization')=='Bearer test-secret') is trusted


@pytest.mark.asyncio
async def test_probe_keeps_ollama_tags_fallback(client,test_user,auth_headers):
    upstream=AsyncMock();upstream.__aenter__.return_value=upstream
    upstream.get.side_effect=[httpx.Response(404),httpx.Response(200,json={'models':[{'name':'llava:7b'},{'name':'llama3'}]})]
    with patch('app.api.preferences.httpx.AsyncClient',return_value=upstream):
        r=await client.post('/api/v1/users/me/preferences/test-ai-endpoint',headers=auth_headers,json={'url':'http://ollama.test/v1'})
    assert r.json()['status']=='connected'
    assert r.json()['vision_models']==['llava:7b']
    assert r.json()['text_models']==['llama3']
