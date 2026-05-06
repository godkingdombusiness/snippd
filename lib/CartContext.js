import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addItemsToActiveCart,
  normalizeCartItem,
  readActiveCart,
} from '../src/services/cartStorage';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCart = useCallback(async () => {
    try {
      const { items } = await readActiveCart();
      setCart(items);
    } catch (e) {
      console.error('[CartContext] load error:', e);
      setCart([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveCart = useCallback(async (newCart) => {
    try {
      const { key } = await readActiveCart();
      await AsyncStorage.setItem(key, JSON.stringify(newCart));
      setCart(newCart);
    } catch (e) {
      console.error('[CartContext] save error:', e);
    }
  }, []);

  const addToCart = useCallback(async (item) => {
    const normalizedItem = normalizeCartItem(item);
    const cartId = normalizedItem.id;
    const existing = cart.find(i => i.id === cartId);
    if (existing) return 'already_added';

    const { items } = await addItemsToActiveCart(normalizedItem);
    setCart(items);
    return 'added';
  }, [cart]);

  const removeFromCart = useCallback(async (itemId) => {
    const newCart = cart.filter(i => i.id !== itemId);
    await saveCart(newCart);
  }, [cart, saveCart]);

  const isInCart = useCallback((dealId) => {
    return cart.some(item => item.id === `discover_${dealId}`);
  }, [cart]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  const value = {
    cart,
    loading,
    addToCart,
    removeFromCart,
    isInCart,
    reloadCart: loadCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
