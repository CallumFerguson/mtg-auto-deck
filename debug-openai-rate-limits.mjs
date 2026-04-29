import "dotenv/config"

import OpenAI from "openai"

// const DEFAULT_PROMPT = `
// use the get_random_number mcp function to get a random number, then use the Babylonian method to calculate the square root of it, and use the echo mcp function with the result.
// `;

const DEFAULT_PROMPT = `
I'm testing a problem with token usage and mcp function calling. call the echo mcp function 30 times. ignore the following Lorem ipsum text.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. In vehicula nec eros id laoreet. Aliquam dictum eu velit accumsan facilisis. Donec nec risus sed metus maximus pharetra. Phasellus sagittis mi a quam venenatis gravida. Aliquam sit amet auctor tortor. Pellentesque fermentum vel purus sit amet ullamcorper. Donec sodales quam ut nisl egestas, ac vulputate mauris feugiat.

Curabitur ut nunc et est tincidunt viverra vitae vitae neque. Proin massa mi, cursus pulvinar diam ut, posuere tempus sapien. Aenean nec orci id est dictum gravida. Phasellus non pulvinar neque, et convallis tortor. Ut gravida metus vitae orci hendrerit gravida. Vivamus tincidunt lorem non aliquet porta. Aenean malesuada lectus bibendum ultrices volutpat. Nulla nec turpis leo. Sed in mollis leo. Suspendisse ut vehicula velit.

Ut ut metus aliquam, tincidunt ipsum laoreet, tincidunt mi. Pellentesque dignissim, nulla a porta convallis, arcu erat pharetra nisl, eu accumsan mi urna sed tortor. Ut erat lorem, pellentesque et eleifend ut, pharetra at nisi. Duis porta tortor eget nulla luctus auctor. Nulla ac ullamcorper risus, in laoreet turpis. Duis sollicitudin varius ante a ornare. Maecenas egestas ex in velit varius suscipit. Mauris maximus est sit amet neque aliquam, rutrum ultricies elit commodo. Etiam maximus nec nunc sit amet convallis. Donec ac sapien consequat, ullamcorper lacus eget, aliquet nulla.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Aenean elementum nulla ut dapibus vulputate. Phasellus tempus consequat mi. Aenean efficitur fermentum leo laoreet tempus. Ut blandit, mauris in dapibus rutrum, tellus nulla congue mi, ut porttitor quam tortor at nisl. Quisque nec ipsum est. Suspendisse sed ligula eget nibh auctor ornare. Aliquam erat volutpat. Vivamus nunc lacus, mattis in tincidunt sit amet, sagittis nec orci. Vestibulum a dui sit amet tellus viverra convallis. Ut odio nulla, varius sit amet tincidunt non, mattis sit amet orci. Nam lacus elit, efficitur pellentesque odio interdum, molestie dictum sapien. Suspendisse pharetra egestas lorem, sed finibus arcu pharetra euismod. Aenean pretium metus in hendrerit finibus. Fusce placerat a metus quis auctor. Morbi in luctus mauris.

Vivamus maximus tortor eget nibh bibendum, nec consequat nisl cursus. Phasellus aliquet lorem in elit molestie, at gravida massa lobortis. Nunc elementum justo metus, id hendrerit dolor fringilla tempus. Morbi ullamcorper id massa tincidunt interdum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sit amet metus tellus. Mauris fermentum, lacus mollis mollis vulputate, felis ex tincidunt ligula, vel posuere lectus mi vitae felis. Nunc vel nibh imperdiet orci imperdiet pulvinar a in lorem. In elementum interdum nisl, vel maximus turpis sagittis fermentum. Praesent luctus, magna eget volutpat maximus, leo nisi aliquam ligula, in porttitor nulla neque id lacus. Nulla a tempus dolor. Suspendisse vitae tortor sollicitudin, sodales neque vel, fringilla magna.

Nulla vulputate nunc a malesuada euismod. Interdum et malesuada fames ac ante ipsum primis in faucibus. Nullam at feugiat augue. Nullam gravida libero et imperdiet venenatis. Aliquam dictum, elit sagittis malesuada lobortis, sem felis sollicitudin nunc, a bibendum velit urna vel tellus. In aliquet justo non ultrices efficitur. Donec fringilla mollis elit non ullamcorper. In convallis, eros eget venenatis imperdiet, magna dui pulvinar ligula, non ultrices lorem sapien sed metus.

Cras vitae metus porttitor, commodo tellus quis, scelerisque ante. Duis ipsum mauris, dapibus quis diam at, sodales pretium mi. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Nullam fermentum ligula a magna egestas, et egestas erat ornare. Duis vel consequat magna. Proin ultricies eget elit id scelerisque. Quisque interdum quam a libero semper pulvinar. Donec tempor lectus nibh, vel bibendum lorem blandit nec. Sed a consequat turpis, ac consequat metus.

Vivamus sit amet lacinia purus. Nulla non felis sed dui gravida euismod sed ac ipsum. Phasellus at augue quam. Maecenas id eros non tortor ornare venenatis in tempor sem. Nam sit amet placerat tortor. Cras dignissim nibh ante, vel consequat elit sollicitudin eget. Phasellus ut nulla sem. Praesent suscipit, justo sit amet euismod condimentum, ligula sem molestie mi, vel fermentum ligula mauris et velit. Fusce nisi leo, sodales in maximus quis, ultricies sed dolor. Pellentesque massa orci, vulputate id id.
`;

const RATE_LIMIT_HEADER_PREFIXES = [
  "x-ratelimit-",
  "x-request-id",
  "retry-after",
  "openai-",
]

function getRequiredEnv(name) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to your repo-root .env file or set it in this terminal session.`
    )
  }

  return value
}

function getOptionalEnv(name) {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function headersToObject(headers) {
  if (!headers) {
    return {}
  }

  if (typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries())
  }

  return { ...headers }
}

function pickDebugHeaders(headers) {
  const headerObject = headersToObject(headers)
  const picked = {}

  for (const [name, value] of Object.entries(headerObject)) {
    const normalizedName = name.toLowerCase()

    if (
      RATE_LIMIT_HEADER_PREFIXES.some((prefix) =>
        normalizedName.startsWith(prefix)
      )
    ) {
      picked[name] = value
    }
  }

  return picked
}

function logJson(label, value) {
  console.log(`\n${label}`)
  console.log(JSON.stringify(value, null, 2))
}

function isRecord(value) {
  return typeof value === "object" && value !== null
}

function compactMcpEvent(event) {
  return {
    type: event.type,
    item_id: event.item_id ?? event.item?.id ?? undefined,
    output_index: event.output_index ?? undefined,
    name: event.name ?? event.item?.name ?? undefined,
    server_label: event.server_label ?? event.item?.server_label ?? undefined,
    arguments: event.arguments ?? event.item?.arguments ?? undefined,
    error: event.error ?? event.item?.error ?? undefined,
    output: event.output ?? event.item?.output ?? undefined,
  }
}

function buildRequestPayload({
  model,
  prompt,
  reasoningEffort,
  openingHandMcpPublicUrl,
}) {
  const payload = {
    model,
    input: prompt,
    stream: true,
    max_output_tokens: 100000,
    metadata: {
      purpose: "rate_limit_debug",
    },
    tools: [
      {
        type: "mcp",
        server_label: "opening_hand",
        server_description:
          "Tools for drawing, mulliganing, and finalizing a Magic: The Gathering opening hand simulation.",
        server_url: openingHandMcpPublicUrl,
        require_approval: "never",
      },
    ],
  }

  if (reasoningEffort && reasoningEffort !== "none") {
    payload.reasoning = {
      effort: reasoningEffort,
      summary: "auto",
    }
  }

  return payload
}

async function main() {
  const apiKey = getRequiredEnv("OPENAI_API_KEY")
  const model = getRequiredEnv("OPENAI_MODEL")
  const reasoningEffort = getOptionalEnv("OPENAI_REASONING_EFFORT")
  const openingHandMcpPublicUrl = getRequiredEnv("OPENING_HAND_MCP_PUBLIC_URL")
  const prompt = process.argv.slice(2).join(" ").trim() || DEFAULT_PROMPT
  const client = new OpenAI({ apiKey })
  const payload = buildRequestPayload({
    model,
    prompt,
    reasoningEffort,
    openingHandMcpPublicUrl,
  })
  const startedAt = Date.now()

  logJson("Request", {
    ...payload,
    input: prompt,
    apiKey: "[redacted]",
  })

  const request = client.responses.create(payload)
  const { data: stream, response, request_id: requestId } =
    await request.withResponse()

  console.log(`\nHTTP status: ${response.status} ${response.statusText}`)
  console.log(`OpenAI request id: ${requestId ?? "(missing)"}`)
  logJson("All response headers", headersToObject(response.headers))

  const rateLimitHeaders = pickDebugHeaders(response.headers)
  let completedResponse = null
  let usage = null
  let outputText = ""
  let reasoningSummaryText = ""
  const eventCounts = new Map()

  console.log("\nStream events")

  for await (const event of stream) {
    const eventType = isRecord(event) ? event.type : "unknown"
    eventCounts.set(eventType, (eventCounts.get(eventType) ?? 0) + 1)

    if (eventType === "response.output_text.delta") {
      const delta = event.delta ?? ""
      outputText += delta
      process.stdout.write(delta)
      continue
    }

    if (
      eventType === "response.reasoning_summary_text.delta" ||
      eventType === "response.reasoning_summary.delta"
    ) {
      const delta = event.delta ?? ""
      reasoningSummaryText += delta
      process.stdout.write(delta)
      continue
    }

    if (
      eventType === "response.reasoning_summary_part.added" ||
      eventType === "response.reasoning_summary_text.done" ||
      eventType === "response.reasoning_summary_part.done" ||
      eventType === "response.reasoning_summary.done"
    ) {
      logJson(`[${eventType}]`, event)
      continue
    }

    if (typeof eventType === "string" && eventType.includes(".mcp_")) {
      logJson(`[${eventType}]`, compactMcpEvent(event))
      continue
    }

    if (eventType === "response.completed") {
      completedResponse = event.response ?? null
      usage = completedResponse?.usage ?? null
      outputText = completedResponse?.output_text || outputText
      console.log("\n[response.completed]")
      continue
    }

    if (
      eventType === "response.failed" ||
      eventType === "response.incomplete" ||
      eventType === "error"
    ) {
      logJson(`[${eventType}]`, event)
    }
  }

  const elapsedMs = Date.now() - startedAt

  if (completedResponse?.status && completedResponse.status !== "completed") {
    logJson("Non-completed response status", {
      status: completedResponse.status,
      incomplete_details: completedResponse.incomplete_details ?? null,
      error: completedResponse.error ?? null,
    })
  }

  logJson("Event counts", Object.fromEntries(eventCounts.entries()))
  logJson("Usage", usage)
  logJson("Completed response", completedResponse)
  console.log(`\nReasoning summary text: ${reasoningSummaryText || "(empty)"}`)
  console.log(`\nOutput text: ${outputText || "(empty)"}`)
  console.log(`Elapsed: ${elapsedMs}ms`)
  logJson("Summary: rate-limit and request headers", rateLimitHeaders)
  logJson("Summary: token usage", usage)
}

main().catch((error) => {
  console.error("\nRequest failed")
  console.error(`${error.name ?? "Error"}: ${error.message}`)

  if (error.status) {
    console.error(`Status: ${error.status}`)
  }

  if (error.request_id) {
    console.error(`OpenAI request id: ${error.request_id}`)
  }

  const headers = error.headers ?? error.response?.headers

  if (headers) {
    logJson("Rate-limit and request headers", pickDebugHeaders(headers))
    logJson("All error headers", headersToObject(headers))
  }

  if (error.error) {
    logJson("OpenAI error body", error.error)
  } else if (error.body) {
    logJson("OpenAI error body", error.body)
  }

  process.exitCode = 1
})
