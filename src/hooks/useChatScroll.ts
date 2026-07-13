import { useRef, useEffect, useCallback, useState } from 'react';
import { FlatList } from 'react-native';

interface UseChatScrollOptions {
  flatListRef: React.RefObject<FlatList<any> | null>;
  messages: any[];
  myUsername?: string;
}

interface UseChatScrollReturn {
  onContentSizeChange: () => void;
  onScroll: (event: any) => void;
  onScrollBeginDrag: () => void;
  onScrollToBottomPress: () => void;
  onSendMessage: () => void;
  showScrollButton: boolean;
  scrollToEnd: (animated?: boolean) => void;
  resetScrollState: () => void;
}

export const useChatScroll = ({
  flatListRef,
  messages,
  myUsername,
}: UseChatScrollOptions): UseChatScrollReturn => {
  const isAtBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const userScrolledUpRef = useRef(false);
  const lastMessageCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const pendingUserMessageRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const scrollToEnd = useCallback((animated = true) => {
    if (isMountedRef.current && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated });
    }
  }, [flatListRef]);

  const onContentSizeChange = useCallback(() => {
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      if (isMountedRef.current) {
        scrollToEnd(false);
      }
      return;
    }

    if (pendingUserMessageRef.current) {
      pendingUserMessageRef.current = false;
      if (isMountedRef.current) {
        scrollToEnd(true);
      }
      return;
    }

    const atBottom = isAtBottomRef.current;
    const userScrolled = userScrolledUpRef.current;

    if (atBottom && !userScrolled) {
      if (isMountedRef.current) {
        scrollToEnd(true);
      }
    } else if (!atBottom && !userScrolled && messages.length > lastMessageCountRef.current) {
      isAtBottomRef.current = true;
      if (isMountedRef.current) {
        scrollToEnd(true);
      }
    }
  }, [scrollToEnd, messages.length]);

  const onScroll = useCallback(
    (event: any) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const offset = contentOffset.y;
      const contentHeight = contentSize.height;
      const layoutHeight = layoutMeasurement.height;
      const threshold = 50;

      const atBottom = contentHeight - layoutHeight - offset <= threshold;
      isAtBottomRef.current = atBottom;

      if (atBottom) {
        userScrolledUpRef.current = false;
        if (showScrollButton) setShowScrollButton(false);
      } else {
        userScrolledUpRef.current = true;
        if (!showScrollButton) setShowScrollButton(true);
      }
    },
    [showScrollButton]
  );

  const onScrollBeginDrag = useCallback(() => {
    userScrolledUpRef.current = true;
    if (!showScrollButton) setShowScrollButton(true);
  }, [showScrollButton]);

  const onScrollToBottomPress = useCallback(() => {
    userScrolledUpRef.current = false;
    isAtBottomRef.current = true;
    setShowScrollButton(false);
    scrollToEnd(true);
  }, [scrollToEnd]);

  const onSendMessage = useCallback(() => {
    pendingUserMessageRef.current = true;
    userScrolledUpRef.current = false;
    isAtBottomRef.current = true;
    setShowScrollButton(false);
  }, []);

  useEffect(() => {
    if (messages.length > lastMessageCountRef.current && lastMessageCountRef.current > 0) {
      onContentSizeChange();
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, onContentSizeChange]);

  const resetScrollState = useCallback(() => {
    isAtBottomRef.current = true;
    userScrolledUpRef.current = false;
    initialScrollDoneRef.current = false;
    lastMessageCountRef.current = 0;
    pendingUserMessageRef.current = false;
    setShowScrollButton(false);
  }, []);

  return {
    onContentSizeChange,
    onScroll,
    onScrollBeginDrag,
    onScrollToBottomPress,
    onSendMessage,
    showScrollButton,
    scrollToEnd,
    resetScrollState,
  };
};

export default useChatScroll;