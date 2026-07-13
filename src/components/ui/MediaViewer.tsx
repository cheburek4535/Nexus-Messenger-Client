import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Dimensions, Animated, Easing, TouchableOpacity, Platform, BackHandler, Text } from 'react-native';
import { PanGestureHandler, State, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useTheme } from '../../theme/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MediaViewerProps {
  visible: boolean;
  onClose: () => void;
  mediaType: 'image' | 'video';
  uri: string;
  mimeType?: string;
  title?: string;
}

const MediaViewer: React.FC<MediaViewerProps> = ({
  visible,
  onClose,
  mediaType,
  uri,
  mimeType,
  title,
}) => {
  const { colors } = useTheme();
  const [opacity] = useState(new Animated.Value(0));
  const [scale] = useState(new Animated.Value(0.9));
  const [videoPosition, setVideoPosition] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<Video | null>(null);
const [translateX] = useState(() => new Animated.Value(0));
  const [translateXValue, setTranslateXValue] = useState(0);

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true, listener: (event: any) => { if (event?.nativeEvent?.translationX !== undefined) setTranslateXValue(event.nativeEvent.translationX); } }
  );

  const onHandlerStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.state === 3) { // END
      if (translateXValue > 100) {
        onClose();
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(() => {
          setTranslateXValue(0);
        });
      }
    }
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 250, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity, scale]);

  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [visible]);

  const handleVideoStatus = (status: any) => {
    if (status.isLoaded) {
      setVideoDuration(status.durationMillis || 0);
      if (status.didJustFinish && !status.isLooping) {
        setIsPlaying(false);
        setVideoPosition(0);
      }
    }
  };

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    try {
      const status = await videoRef.current.getStatusAsync();
      if (status.isLoaded) {
        if (status.isPlaying) {
          await videoRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          await videoRef.current.playAsync();
          setIsPlaying(true);
        }
      }
    } catch (e) {
      console.error('Video play/pause error:', e);
    }
  };

  const seekVideo = async (position: number) => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.setPositionAsync(position);
      setVideoPosition(position);
    } catch (e) {
      console.error('Video seek error:', e);
    }
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const onTap = () => {
    setShowControls(!showControls);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (showControls) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  };

  const handleVideoLoad = async () => {
    if (videoRef.current) {
      const status = await videoRef.current.getStatusAsync();
      if (status.isLoaded) {
        setVideoDuration(status.durationMillis || 0);
        setIsPlaying(status.isPlaying);
      }
    }
  };

  if (!visible) return null;

  return (
    <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
      >
        <Animated.View
          style={[
            styles.container,
            { opacity, transform: [{ scale }, { translateX }] },
            { backgroundColor: colors.background },
          ]}
          pointerEvents="auto"
        >
          <TouchableOpacity onPress={onTap} activeOpacity={1} style={styles.touchArea}>
            {mediaType === 'image' ? (
              <Image
                source={{ uri }}
                style={styles.image}
                resizeMode="contain"
                onLoad={() => setShowControls(false)}
              />
            ) : (
              <Video
                ref={videoRef}
                source={{ uri }}
                style={styles.video}
                useNativeControls={false}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={isPlaying}
                isLooping={false}
                onPlaybackStatusUpdate={handleVideoStatus}
                onLoad={handleVideoLoad}
                onLoadStart={() => setIsPlaying(true)}
              />
            )}
          </TouchableOpacity>

          {showControls && (
            <View style={styles.controlsContainer}>
              <View style={styles.topBar}>
                <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={Platform.OS === 'ios' ? 'chevron-down' : 'close'} size={28} color={colors.text} />
                </TouchableOpacity>
                {title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
                <View style={{ width: 48 }} />
              </View>

              {mediaType === 'video' && (
                <View style={styles.videoControls}>
                  <View style={styles.progressContainer}>
                    <Text style={styles.timeText}>{formatTime(videoPosition)}</Text>
                    <View style={styles.progressBar}>
                      <Animated.View
                        style={[
                          styles.progressFill,
                          { width: videoDuration > 0 ? `${(videoPosition / videoDuration) * 100}%` : '0%' },
                        ]}
                      />
                    </View>
                    <Text style={styles.timeText}>{formatTime(videoDuration)}</Text>
                  </View>
                  <View style={styles.playButtonRow}>
                    <TouchableOpacity
                      onPress={togglePlayPause}
                      style={[
                        styles.playButton,
                        { backgroundColor: isPlaying ? colors.accent + 'CC' : colors.accent },
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => seekVideo(0)}
                      style={styles.replayButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="refresh" size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </PanGestureHandler>
    );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  touchArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    pointerEvents: 'none',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  closeButton: {
    padding: 8,
  },
  title: {
    flex: 1,
    color: '#FFF',
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  videoControls: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    pointerEvents: 'auto',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 500,
  },
  timeText: {
    color: '#FFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 2,
  },
  playButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    pointerEvents: 'auto',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  replayButton: {
    padding: 12,
  },
});

export default MediaViewer;