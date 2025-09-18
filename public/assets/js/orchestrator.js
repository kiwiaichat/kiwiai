// yes this is the same orchestrator mechanism as used in composite
let models = [{"name":"deepseek-reasoning","description":"DeepSeek R1 0528","maxInputChars":5000,"reasoning":true,"tier":"seed","community":false,"aliases":["deepseek-r1-0528","us.deepseek.r1-v1:0"],"input_modalities":["text"],"output_modalities":["text"],"tools":false,"vision":false,"audio":false},{"name":"gemini","description":"Gemini 2.5 Flash Lite (api.navy)","tier":"anonymous","community":false,"aliases":["gemini-2.5-flash-lite"],"input_modalities":["text","image"],"output_modalities":["text"],"tools":true,"vision":true,"audio":false},{"name":"mistral","description":"Mistral Small 3.1 24B","tier":"anonymous","community":false,"aliases":["mistral-small-3.1-24b-instruct","mistral-small-3.1-24b-instruct-2503"],"input_modalities":["text"],"output_modalities":["text"],"tools":true,"vision":false,"audio":false},{"name":"nova-fast","description":"Amazon Nova Micro","community":false,"tier":"anonymous","aliases":["nova-micro-v1"],"input_modalities":["text"],"output_modalities":["text"],"tools":true,"vision":false,"audio":false},{"name":"openai","description":"OpenAI GPT-5 Nano","tier":"anonymous","community":false,"aliases":["gpt-5-nano","openai-large"],"input_modalities":["text","image"],"output_modalities":["text"],"tools":true,"vision":true,"audio":false},{"name":"openai-audio","description":"OpenAI GPT-4o Mini Audio Preview","maxInputChars":2000,"voices":["alloy","echo","fable","onyx","nova","shimmer","coral","verse","ballad","ash","sage","amuch","dan"],"tier":"seed","community":false,"aliases":["gpt-4o-mini-audio-preview"],"input_modalities":["text","image","audio"],"output_modalities":["audio","text"],"tools":true,"vision":true,"audio":true},{"name":"openai-fast","description":"OpenAI GPT-4.1 Nano","tier":"anonymous","community":false,"input_modalities":["text","image"],"output_modalities":["text"],"tools":true,"vision":true,"audio":false},{"name":"openai-reasoning","description":"OpenAI o4-mini (api.navy)","tier":"seed","community":false,"aliases":["o4-mini"],"reasoning":true,"supportsSystemMessages":false,"input_modalities":["text","image"],"output_modalities":["text"],"tools":true,"vision":true,"audio":false},{"name":"qwen-coder","description":"Qwen 2.5 Coder 32B","tier":"anonymous","community":false,"aliases":["qwen2.5-coder-32b-instruct"],"input_modalities":["text"],"output_modalities":["text"],"tools":true,"vision":false,"audio":false},{"name":"roblox-rp","description":"Llama 3.1 8B Instruct (Cross-Region)","tier":"seed","community":false,"aliases":["llama-roblox","llama-fast-roblox"],"input_modalities":["text"],"output_modalities":["text"],"tools":true,"vision":false,"audio":false},{"name":"bidara","description":"BIDARA (Biomimetic Designer and Research Assistant by NASA)","tier":"anonymous","community":true,"input_modalities":["text","image"],"output_modalities":["text"],"tools":true,"vision":true,"audio":false},{"name":"evil","description":"Evil","uncensored":true,"tier":"seed","community":true,"input_modalities":["text","image"],"output_modalities":["text"],"tools":true,"vision":true,"audio":false},{"name":"midijourney","description":"MIDIjourney","tier":"anonymous","community":true,"input_modalities":["text"],"output_modalities":["text"],"tools":true,"vision":false,"audio":false},{"name":"mirexa","description":"Mirexa AI Companion","tier":"seed","community":true,"input_modalities":["text","image"],"output_modalities":["text"],"tools":true,"vision":true,"audio":false},{"name":"rtist","description":"Rtist","tier":"seed","community":true,"input_modalities":["text"],"output_modalities":["text"],"tools":true,"vision":false,"audio":false},{"name":"unity","description":"Unity Unrestricted Agent","uncensored":true,"tier":"seed","community":true,"input_modalities":["text","image"],"output_modalities":["text"],"tools":true,"vision":true,"audio":false}];

models = models.filter(model => model.tier === 'anonymous');


function orchestrator(api, models, chat) {

    let prompt = `
    You are orchestrator, a system that decides the best LLM to use to respond within a roleplay senario.

    You can use the following LLMs: ${models.map(model => model.name).join(', ')}

    Given the following messages: ${chat.slice(Math.max(chat.length - 3, 0)).join('\n')}

    Please respond in this format: "[reasoning for picking llm]|[llm name]"
    `

    try {
        return api.chat(prompt).split('|')[1];
    }
    catch (error) {
        console.log("[ORCHESTRATOR] failed to pick llm, defaulting to mistral");
        return "mistral" 
    }

    
}