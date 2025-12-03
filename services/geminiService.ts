import { GoogleGenAI, Type, Schema } from "@google/genai";
import { addReminderToDB } from "./firebase";

// Initialize Gemini
// The API key must be obtained exclusively from the environment variable process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface ProcessResult {
  action: 'add_reminder' | 'chat' | 'error';
  text?: string;
  type?: 'info' | 'alert' | 'action';
  response?: string;
}

export const processCommandWithGemini = async (command: string): Promise<ProcessResult> => {
  const systemPrompt = `
    Você é o "Smart Home", o assistente da casa de André e Marcelly.
    Analise o comando: "${command}".
    
    Responda APENAS com um JSON válido.
    
    CASO 1: O usuário quer adicionar um lembrete, tarefa, lista de compras ou aviso.
    Set action="add_reminder".
    
    CASO 2: O usuário fez uma pergunta, cumprimento ou conversa fiada.
    Set action="chat".
  `;

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        enum: ["add_reminder", "chat", "error"],
      },
      text: {
        type: Type.STRING,
        description: "Texto resumido do lembrete, se aplicável",
      },
      type: {
        type: Type.STRING,
        enum: ["info", "alert", "action"],
        description: "Tipo do lembrete: alert (urgente), action (tarefa), info (padrão)",
      },
      response: {
        type: Type.STRING,
        description: "Sua resposta curta (max 2 frases), simpática e natural em pt-BR.",
      },
    },
    required: ["action"],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      }
    });

    // Use .text property directly
    const rawText = response.text;
    if (!rawText) {
       return { action: 'error', response: "Erro: Resposta vazia do modelo." };
    }
    
    const result = JSON.parse(rawText);

    if (result.action === 'add_reminder') {
      await addReminderToDB(result.text, result.type || 'info');
      return { ...result, response: `Adicionado: ${result.text}` };
    } 
    
    return result;

  } catch (error) {
    console.error("Erro Gemini:", error);
    return { action: 'error', response: "Desculpe, tive um problema ao processar." };
  }
};

export const askChefAI = async (ingredients: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Você é um Chef experiente e conciso. Sugira uma receita ou ideia culinária rápida baseada nestes ingredientes ou pedido: "${ingredients}". Responda em português, de forma direta e curta.`,
    });
    return response.text || "Sem ideias no momento.";
  } catch (e) {
    console.error(e);
    return "Erro ao consultar o Chef.";
  }
};