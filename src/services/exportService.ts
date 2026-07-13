// import * as FileSystem from 'expo-file-system';
// import * as Sharing from 'expo-sharing';
// import { getMessages } from './messageService';
// import { getChatByUsername } from './chatService';
// import { encryptLocalData } from '../crypto/localEncryption';

// export type ExportFormat = 'txt' | 'json' | 'encrypted';

// export async function exportChat(
//   username: string, 
//   format: ExportFormat,
//   password?: string
// ): Promise<string> {
//   const chat = await getChatByUsername(username);
//   if (!chat) throw new Error('Chat not found');

//   const messages = await getMessages(chat.id, 10000); // Все сообщения
  
//   let content: string;
//   let fileName: string;
//   const mimeType = 'application/octet-stream';

//   switch (format) {
//     case 'json':
//       content = JSON.stringify({
//         chat: { username: chat.username },
//         messages: messages.map(msg => ({
//           from: msg.senderUsername,
//           text: msg.contentText,
//           time: new Date(msg.timestamp).toISOString(),
//         })),
//         exportedAt: new Date().toISOString(),
//       }, null, 2);
//       fileName = `nexus_${username}_${Date.now()}.json`;
//       break;

//     case 'txt':
//       content = messages.map(msg => {
//         const time = new Date(msg.timestamp).toLocaleString();
//         return `[${time}] ${msg.senderUsername}: ${msg.contentText}`;
//       }).join('\n\n');
//       fileName = `nexus_${username}_${Date.now()}.txt`;
//       break;

//     case 'encrypted':
//       const jsonContent = JSON.stringify({
//         messages: messages.map(msg => ({
//           from: msg.senderUsername,
//           text: msg.contentText,
//           time: msg.timestamp,
//         })),
//       });
//       content = await encryptLocalData(jsonContent);
//       fileName = `nexus_${username}_${Date.now()}.enc`;
//       break;
//   }

//   const filePath = `${FileSystem.documentDirectory}${fileName}`;
//   await FileSystem.writeAsStringAsync(filePath, content);

//   // Шеринг файла
//   if (await Sharing.isAvailableAsync()) {
//     await Sharing.shareAsync(filePath, { mimeType, dialogTitle: 'Export Chat' });
//   }

//   return filePath;
// }